"""
Dynamic tool registry: loads tools from tool_definitions table at runtime.

Built-in tools map to Python functions. HTTP tools are generic API callers
with credential injection. This is the bridge between DB config and LangGraph.
"""

import json
import logging
import uuid
from typing import Any

from langchain_core.tools import StructuredTool

from app.db import get_pool
from graph.tools.http_tool import build_http_tool
from graph.tools.platform_tool import build_platform_tool

logger = logging.getLogger(__name__)

# Map of built-in tool name -> (module, function_name)
BUILTIN_TOOL_MAP: dict[str, Any] = {}


def _load_builtin_map() -> None:
    """Lazy-load built-in tools to avoid circular imports."""
    if BUILTIN_TOOL_MAP:
        return
    from graph.tools.knowledge_base import search_knowledge_base, find_entities, get_communications
    from graph.tools.workspace import create_node, update_node_properties

    BUILTIN_TOOL_MAP.update({
        "search_knowledge_base": search_knowledge_base,
        "find_entities": find_entities,
        "get_communications": get_communications,
        "create_node": create_node,
        "update_node_properties": update_node_properties,
    })


# Seed data for built-in tools
BUILTIN_SEED = [
    {
        "name": "search_knowledge_base",
        "display_name": "Search Knowledge Base",
        "description": "Full-text search across all workspace pages and databases.",
    },
    {
        "name": "find_entities",
        "display_name": "Find Entities",
        "description": "Find people, organizations, or bots in workspace contacts.",
    },
    {
        "name": "get_communications",
        "display_name": "Get Communications",
        "description": "Fetch recent communications (emails, Slack, webhooks).",
    },
    {
        "name": "create_node",
        "display_name": "Create Node",
        "description": "Create a new page, task, or database row in the workspace.",
    },
    {
        "name": "update_node_properties",
        "display_name": "Update Node Properties",
        "description": "Update metadata/properties on an existing node.",
    },
]


async def seed_builtin_tools() -> None:
    """Insert built-in tool_definitions if they don't exist. Idempotent."""
    pool = get_pool()
    for tool in BUILTIN_SEED:
        await pool.execute("""
            INSERT INTO tool_definitions (owner_id, name, display_name, description, type)
            VALUES (NULL, $1, $2, $3, 'builtin')
            ON CONFLICT DO NOTHING
        """, tool["name"], tool["display_name"], tool["description"])
    logger.info("Seeded %d built-in tool definitions", len(BUILTIN_SEED))


async def load_tools_for_agent(
    owner_id: str,
    tool_ids: list[str] | None = None,
) -> list[Any]:
    """
    Load tools from DB, returning LangChain tool objects.

    If tool_ids is provided and non-empty, only load those specific tools.
    Otherwise, load all active tools accessible to the owner.
    """
    _load_builtin_map()
    pool = get_pool()

    if tool_ids:
        # Load specific tools by ID
        rows = await pool.fetch("""
            SELECT id, name, type::text, config, credential_id
            FROM tool_definitions
            WHERE id = ANY($1::uuid[]) AND is_active = true
        """, [uuid.UUID(tid) for tid in tool_ids])
    else:
        # Load all active tools: system-wide (owner_id IS NULL) + user's custom tools
        rows = await pool.fetch("""
            SELECT id, name, type::text, config, credential_id
            FROM tool_definitions
            WHERE is_active = true AND (owner_id IS NULL OR owner_id = $1)
        """, uuid.UUID(owner_id))

    tools = []
    for row in rows:
        tool_name = row["name"]
        tool_type = row["type"]

        if tool_type == "builtin":
            builtin = BUILTIN_TOOL_MAP.get(tool_name)
            if builtin:
                tools.append(builtin)
            else:
                logger.warning("Built-in tool '%s' not found in code", tool_name)

        elif tool_type == "http":
            try:
                http_tool = await build_http_tool(
                    name=tool_name,
                    config=dict(row["config"]) if row["config"] else {},
                    credential_id=str(row["credential_id"]) if row["credential_id"] else None,
                )
                tools.append(http_tool)
            except Exception as e:
                logger.warning("Failed to build HTTP tool '%s': %s", tool_name, e)

        elif tool_type == "platform":
            try:
                result = await build_platform_tool(
                    name=tool_name,
                    config=dict(row["config"]) if row["config"] else {},
                    owner_id=owner_id,
                )
                if result is None:
                    pass
                elif isinstance(result, list):
                    tools.extend(result)
                else:
                    tools.append(result)
            except Exception as e:
                logger.warning("Failed to build platform tool '%s': %s", tool_name, e)

    return tools


def wrap_tools_with_owner(tools: list[Any], owner_id: str) -> list[Any]:
    """
    Wrap tools that need owner_id injection (search_knowledge_base, create_node).
    Returns a new list with owner-aware wrappers.
    """
    from graph.tools.knowledge_base import search_knowledge_base
    from graph.tools.workspace import create_node

    wrapped = []
    for t in tools:
        if t.name == "create_node":
            async def _create_with_owner(
                title: str,
                node_type: str = "page",
                parent_id: str | None = None,
                properties: str | None = None,
                _oid: str = owner_id,
            ) -> str:
                return await create_node.ainvoke({
                    "title": title,
                    "node_type": node_type,
                    "parent_id": parent_id or "",
                    "properties": properties or "{}",
                    "owner_id": _oid,
                })

            wrapped.append(StructuredTool.from_function(
                coroutine=_create_with_owner,
                name="create_node",
                description=create_node.description,
            ))

        elif t.name == "search_knowledge_base":
            async def _search_with_owner(
                query: str,
                limit: int = 10,
                _oid: str = owner_id,
            ) -> str:
                return await search_knowledge_base.ainvoke({
                    "query": query,
                    "limit": limit,
                    "owner_id": _oid,
                })

            wrapped.append(StructuredTool.from_function(
                coroutine=_search_with_owner,
                name="search_knowledge_base",
                description=search_knowledge_base.description,
            ))
        else:
            wrapped.append(t)

    return wrapped
