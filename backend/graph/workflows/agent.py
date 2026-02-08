"""
ReAct agent workflow: LLM decides which tools to call in a loop.

Replaces fixed pipelines with an agentic loop where the LLM reasons
over workspace data and takes actions (search, create, email, etc).
"""

import json
import logging
import uuid
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import settings
from app.db import get_pool
from app.services.llm_settings import get_llm_config
from graph.tools import ALL_TOOLS
from graph.tools.workspace import create_node

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Roka, an AI workspace assistant. You help users manage their knowledge base, triage incoming information, and take actions.

## Your capabilities
- Search the workspace knowledge base (pages, databases, notes)
- Find and look up contacts (entities) and their communication history
- Create new pages and tasks in the workspace
- Update properties on existing pages (status, priority, dates, etc.)
- Send emails to contacts

## Guidelines
- Always search the knowledge base first when a user asks about existing content.
- When creating tasks, set clear titles and relevant properties.
- When sending emails, confirm the recipient and content make sense.
- Be concise and action-oriented. Summarize what you did after completing actions.
- If you lack information to complete a request, say so clearly rather than guessing.
"""


def _build_owner_tools(owner_id: str) -> list:
    """Wrap workspace tools so they always include owner_id."""
    from langchain_core.tools import StructuredTool
    from graph.tools.knowledge_base import search_knowledge_base

    async def _create_node_with_owner(
        title: str,
        node_type: str = "page",
        parent_id: str | None = None,
        properties: str | None = None,
    ) -> str:
        return await create_node.ainvoke({
            "title": title,
            "node_type": node_type,
            "parent_id": parent_id or "",
            "properties": properties or "{}",
            "owner_id": owner_id,
        })

    owner_create = StructuredTool.from_function(
        coroutine=_create_node_with_owner,
        name="create_node",
        description=create_node.description,
    )

    async def _search_kb_with_owner(
        query: str,
        limit: int = 10,
    ) -> str:
        return await search_knowledge_base.ainvoke({
            "query": query,
            "limit": limit,
            "owner_id": owner_id,
        })

    owner_search = StructuredTool.from_function(
        coroutine=_search_kb_with_owner,
        name="search_knowledge_base",
        description=search_knowledge_base.description,
    )

    # Build tool list: replace wrapped tools, keep the rest
    tools = []
    for t in ALL_TOOLS:
        if t.name == "create_node":
            tools.append(owner_create)
        elif t.name == "search_knowledge_base":
            tools.append(owner_search)
        else:
            tools.append(t)
    return tools


async def _build_model():
    """Create a ChatOpenAI instance from the DB LLM config."""
    llm = await get_llm_config()
    if not llm.is_configured:
        raise ValueError("LLM not configured. Go to Settings to add your API key.")

    # Map provider to appropriate base_url
    base_url = llm.api_base or None
    if not base_url:
        if llm.provider == "ollama":
            base_url = "http://host.docker.internal:11434/v1"
        elif llm.provider == "openrouter":
            base_url = "https://openrouter.ai/api/v1"
        # openai uses default

    return ChatOpenAI(
        model=llm.model,
        api_key=llm.api_key or "not-needed",
        base_url=base_url,
        timeout=settings.llm_timeout_seconds,
    )


async def _build_context(node_id: str | None, owner_id: str) -> str:
    """Build additional context from the target node and recent workspace activity."""
    parts = []
    pool = get_pool()

    if node_id:
        row = await pool.fetchrow(
            "SELECT title, search_text, properties FROM nodes WHERE id = $1",
            uuid.UUID(node_id),
        )
        if row:
            parts.append(
                f"## Current page context\n"
                f"Title: {row['title']}\n"
                f"Content: {(row['search_text'] or '')[:2000]}\n"
                f"Properties: {json.dumps(dict(row['properties'])) if row['properties'] else '{}'}"
            )

    # Recent pages for workspace awareness
    recent = await pool.fetch("""
        SELECT title, type::text FROM nodes
        WHERE owner_id = $1 AND type IN ('page', 'database')
        ORDER BY updated_at DESC LIMIT 5
    """, uuid.UUID(owner_id))

    if recent:
        titles = [f"- [{r['type']}] {r['title']}" for r in recent]
        parts.append("## Recent workspace pages\n" + "\n".join(titles))

    return "\n\n".join(parts)


async def run_agent_workflow(
    task_id: str,
    node_id: str | None,
    owner_id: str,
    task_input: dict[str, Any],
) -> dict[str, Any]:
    """Entry point called by task_runner."""
    prompt = task_input.get("prompt", "")
    if not prompt:
        return {"error": "No prompt provided in task input."}

    # Resolve node_id from input if not at top level
    if not node_id:
        node_id = task_input.get("node_id") or None

    try:
        model = await _build_model()
    except ValueError as e:
        return {"error": str(e)}

    tools = _build_owner_tools(owner_id)
    context = await _build_context(node_id, owner_id)

    full_system = SYSTEM_PROMPT
    if context:
        full_system += f"\n\n{context}"

    agent = create_react_agent(model, tools, prompt=full_system)

    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
    )

    # Extract final response: last AI message without tool calls
    messages = result.get("messages", [])
    final_text = ""
    for msg in reversed(messages):
        if hasattr(msg, "content") and msg.content:
            # Skip messages that are tool-calling steps
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                continue
            final_text = msg.content
            break

    # Audit: log to writes table
    pool = get_pool()
    await pool.execute("""
        INSERT INTO writes (task_id, table_name, row_id, operation, new_data)
        VALUES ($1, 'agent_tasks', $2, 'UPDATE', $3::jsonb)
    """,
        uuid.UUID(task_id),
        uuid.UUID(task_id),
        json.dumps({"response": final_text[:2000]}),
    )

    return {"response": final_text}
