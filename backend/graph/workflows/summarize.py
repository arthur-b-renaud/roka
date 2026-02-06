"""
Summarize workflow: fetches node content, calls LLM to summarize,
writes summary back to node properties.

Proves full pipeline: UI trigger -> DB row -> agent pickup -> LLM call -> DB write -> UI sees result
"""

import json
import logging
from typing import Any, TypedDict

import litellm
from langgraph.graph import StateGraph, END

from app.config import settings
from app.db import get_pool

logger = logging.getLogger(__name__)


class SummarizeState(TypedDict):
    task_id: str
    node_id: str
    owner_id: str
    content_text: str
    summary: str


async def fetch_node_content(state: SummarizeState) -> dict[str, Any]:
    """Step 1: Fetch node content from DB."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT title, content, search_text FROM nodes WHERE id = $1",
        __import__("uuid").UUID(state["node_id"]),
    )
    if row is None:
        return {"content_text": ""}

    # Use search_text (generated column) as the best text representation
    text = row["search_text"] or row["title"] or ""
    return {"content_text": text}


async def call_llm_summarize(state: SummarizeState) -> dict[str, Any]:
    """Step 2: Call LLM via LiteLLM to summarize."""
    text = state.get("content_text", "")
    if not text.strip():
        return {"summary": "No content to summarize."}

    response = await litellm.acompletion(
        model=settings.litellm_model,
        messages=[
            {
                "role": "system",
                "content": "You are a concise summarizer. Summarize the following content in 2-3 sentences.",
            },
            {"role": "user", "content": text[:4000]},
        ],
        api_base=settings.litellm_url,
        api_key=settings.litellm_master_key,
    )

    summary = response.choices[0].message.content or "Could not generate summary."
    return {"summary": summary}


async def write_summary(state: SummarizeState) -> dict[str, Any]:
    """Step 3: Write summary back to node properties."""
    pool = get_pool()
    await pool.execute("""
        UPDATE nodes
        SET properties = properties || jsonb_build_object('ai_summary', $2::text),
            updated_at = now()
        WHERE id = $1
    """, __import__("uuid").UUID(state["node_id"]), state["summary"])

    # Audit log
    await pool.execute("""
        INSERT INTO writes (task_id, table_name, row_id, operation, new_data)
        VALUES ($1, 'nodes', $2, 'UPDATE', $3::jsonb)
    """,
        __import__("uuid").UUID(state["task_id"]),
        __import__("uuid").UUID(state["node_id"]),
        json.dumps({"ai_summary": state["summary"]}),
    )

    return {}


def build_summarize_graph() -> StateGraph:
    """Build the LangGraph StateGraph for summarization."""
    graph = StateGraph(SummarizeState)
    graph.add_node("fetch", fetch_node_content)
    graph.add_node("summarize", call_llm_summarize)
    graph.add_node("write", write_summary)

    graph.set_entry_point("fetch")
    graph.add_edge("fetch", "summarize")
    graph.add_edge("summarize", "write")
    graph.add_edge("write", END)

    return graph


async def run_summarize_workflow(
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

    graph = build_summarize_graph()
    app = graph.compile()

    initial_state: SummarizeState = {
        "task_id": task_id,
        "node_id": node_id,
        "owner_id": owner_id,
        "content_text": "",
        "summary": "",
    }

    result = await app.ainvoke(initial_state)
    return {"summary": result.get("summary", "")}
