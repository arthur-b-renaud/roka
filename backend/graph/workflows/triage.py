"""
Smart Triage workflow: classifies content, extracts entities/dates,
creates linked child nodes.

Simplified version of the Cognitive Graph from the spec.
"""

import json
import logging
import uuid
from typing import Any, TypedDict

import litellm
from langgraph.graph import StateGraph, END

from app.config import settings
from app.db import get_pool, with_actor
from app.services.llm_settings import get_llm_config

logger = logging.getLogger(__name__)


class TriageState(TypedDict):
    task_id: str
    node_id: str
    owner_id: str
    content_text: str
    classification: str       # "task" | "note" | "reference" | "spam"
    extracted_entities: list[dict[str, str]]
    extracted_dates: list[str]
    created_node_ids: list[str]


async def fetch_content(state: TriageState) -> dict[str, Any]:
    """Fetch the target node's text content."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT title, search_text FROM nodes WHERE id = $1",
        uuid.UUID(state["node_id"]),
    )
    text = (row["search_text"] or row["title"] or "") if row else ""
    return {"content_text": text}


async def classify_content(state: TriageState) -> dict[str, Any]:
    """LLM classification: task, note, reference, or spam."""
    text = state.get("content_text", "")
    if not text.strip():
        return {"classification": "note"}

    llm = await get_llm_config()
    # Check already done in entry point
    if not llm.is_configured:
        return {"classification": "note"}

    response = await litellm.acompletion(
        model=llm.model_string,
        api_key=llm.api_key,
        api_base=llm.api_base if llm.api_base else None,
        timeout=settings.llm_timeout_seconds,
        messages=[
            {
                "role": "system",
                "content": (
                    "Classify the following content into exactly one category: "
                    "task, note, reference, or spam. "
                    "Respond with ONLY the category word, nothing else."
                ),
            },
            {"role": "user", "content": text[:settings.llm_max_input_chars]},
        ],
    )

    classification = (response.choices[0].message.content or "note").strip().lower()
    if classification not in ("task", "note", "reference", "spam"):
        classification = "note"
    return {"classification": classification}


async def extract_entities_and_dates(state: TriageState) -> dict[str, Any]:
    """LLM extraction: entities (people, orgs) and dates."""
    text = state.get("content_text", "")
    if not text.strip():
        return {"extracted_entities": [], "extracted_dates": []}

    llm = await get_llm_config()
    # Check already done in entry point
    if not llm.is_configured:
        return {"extracted_entities": [], "extracted_dates": []}

    response = await litellm.acompletion(
        model=llm.model_string,
        api_key=llm.api_key,
        api_base=llm.api_base if llm.api_base else None,
        timeout=settings.llm_timeout_seconds,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract entities and dates from the text. "
                    "Return JSON with two keys: "
                    '"entities" (array of {"name": str, "type": "person"|"org"}) '
                    'and "dates" (array of date strings in YYYY-MM-DD format). '
                    "Return only valid JSON."
                ),
            },
            {"role": "user", "content": text[:settings.llm_max_input_chars]},
        ],
    )

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
        entities = parsed.get("entities", [])
        dates = parsed.get("dates", [])
    except json.JSONDecodeError:
        entities = []
        dates = []

    return {
        "extracted_entities": entities if isinstance(entities, list) else [],
        "extracted_dates": dates if isinstance(dates, list) else [],
    }


async def create_linked_nodes(state: TriageState) -> dict[str, Any]:
    """Create child nodes based on classification and extracted data, all in one transaction."""
    owner_id = uuid.UUID(state["owner_id"])
    parent_id = uuid.UUID(state["node_id"])
    task_id_uuid = uuid.UUID(state["task_id"])
    created_ids: list[str] = []

    classification = state.get("classification", "note")

    async with with_actor("agent", state["task_id"]) as conn:
        # If classified as task, create a task node
        if classification == "task":
            row = await conn.fetchrow("""
                INSERT INTO nodes (owner_id, parent_id, type, title, properties)
                VALUES ($1, $2, 'page', 'Extracted Task', $3::jsonb)
                RETURNING id
            """, owner_id, parent_id, json.dumps({
                "source": "triage",
                "classification": classification,
                "dates": state.get("extracted_dates", []),
            }))
            if row:
                created_ids.append(str(row["id"]))

        # Create entity references as linked nodes
        for entity in state.get("extracted_entities", []):
            name = entity.get("name", "Unknown")
            row = await conn.fetchrow("""
                INSERT INTO nodes (owner_id, parent_id, type, title, properties)
                VALUES ($1, $2, 'page', $3, $4::jsonb)
                RETURNING id
            """, owner_id, parent_id, f"Reference: {name}", json.dumps({
                "source": "triage",
                "entity_name": name,
                "entity_type": entity.get("type", "person"),
            }))
            if row:
                created_ids.append(str(row["id"]))

                # Create edge linking source to reference
                await conn.execute("""
                    INSERT INTO edges (source_id, target_id, type)
                    VALUES ($1, $2, 'MENTIONS')
                    ON CONFLICT DO NOTHING
                """, parent_id, row["id"])

        # Audit log
        for nid in created_ids:
            await conn.execute("""
                INSERT INTO writes (task_id, table_name, row_id, operation, new_data)
                VALUES ($1, 'nodes', $2, 'INSERT', '{"source": "triage"}'::jsonb)
            """, task_id_uuid, uuid.UUID(nid))

        # Update original node with triage results
        await conn.execute("""
            UPDATE nodes
            SET properties = properties || $2::jsonb,
                updated_at = now()
            WHERE id = $1
        """, parent_id, json.dumps({
            "ai_classification": classification,
            "ai_entities": state.get("extracted_entities", []),
            "ai_dates": state.get("extracted_dates", []),
        }))

    return {"created_node_ids": created_ids}


def build_triage_graph() -> StateGraph:
    """Build the LangGraph StateGraph for triage."""
    graph = StateGraph(TriageState)
    graph.add_node("fetch", fetch_content)
    graph.add_node("classify", classify_content)
    graph.add_node("extract", extract_entities_and_dates)
    graph.add_node("create", create_linked_nodes)

    graph.set_entry_point("fetch")
    graph.add_edge("fetch", "classify")
    graph.add_edge("classify", "extract")
    graph.add_edge("extract", "create")
    graph.add_edge("create", END)

    return graph


async def run_triage_workflow(
    task_id: str,
    node_id: str | None,
    owner_id: str,
    task_input: dict[str, Any],
) -> dict[str, Any]:
    """Entry point called by task_runner."""
    if not node_id:
        node_id = task_input.get("node_id", "")
    if not node_id:
        return {"error": "No node_id provided"}

    llm = await get_llm_config()
    if not llm.is_configured:
        return {"error": "LLM not configured. Go to Settings to add your API key."}

    graph = build_triage_graph()
    app = graph.compile()

    initial_state: TriageState = {
        "task_id": task_id,
        "node_id": node_id,
        "owner_id": owner_id,
        "content_text": "",
        "classification": "",
        "extracted_entities": [],
        "extracted_dates": [],
        "created_node_ids": [],
    }

    result = await app.ainvoke(initial_state)  # type: ignore[arg-type]
    return {
        "classification": result.get("classification", ""),
        "entities": result.get("extracted_entities", []),
        "dates": result.get("extracted_dates", []),
        "created_node_ids": result.get("created_node_ids", []),
    }
