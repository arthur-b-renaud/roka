"""Workspace tools: create and update nodes (pages, tasks)."""

import json
import uuid
from typing import Optional

from langchain_core.tools import tool

from app.db import get_pool


def _build_paragraph_block(text: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": "paragraph",
        "props": {
            "textColor": "default",
            "backgroundColor": "default",
            "textAlignment": "left",
        },
        "content": [
            {
                "type": "text",
                "text": text,
                "styles": {},
            }
        ],
        "children": [],
    }


@tool
async def create_node(
    title: str,
    node_type: str = "page",
    parent_id: Optional[str] = None,
    properties: Optional[str] = None,
    owner_id: Optional[str] = None,
) -> str:
    """Create a new page or task in the workspace.

    Use this to generate action items, notes, or reference pages
    from agent analysis.

    Args:
        title: Title for the new node.
        node_type: One of 'page', 'database', 'database_row'. Default 'page'.
        parent_id: UUID of parent node to nest under. Optional.
        properties: JSON string of properties (e.g. '{"status": "todo", "priority": "high"}'). Optional.
        owner_id: UUID of the owner. Required (injected by agent context).
    """
    if not owner_id:
        return "Error: owner_id is required to create a node."

    pool = get_pool()

    valid_types = ("page", "database", "database_row")
    if node_type not in valid_types:
        node_type = "page"

    props = {}
    if properties:
        try:
            props = json.loads(properties)
        except json.JSONDecodeError:
            props = {}

    # Mark as agent-created
    props["source"] = "agent"

    parent_uuid = uuid.UUID(parent_id) if parent_id else None

    row = await pool.fetchrow("""
        INSERT INTO nodes (owner_id, parent_id, type, title, properties)
        VALUES ($1, $2, $3::node_type, $4, $5::jsonb)
        RETURNING id
    """,
        uuid.UUID(owner_id),
        parent_uuid,
        node_type,
        title,
        json.dumps(props),
    )

    if row:
        return f"Created {node_type} \"{title}\" with id={row['id']}"
    return "Failed to create node."


@tool
async def update_node_properties(
    node_id: str,
    properties: str,
) -> str:
    """Update properties on an existing node (merge, not replace).

    Use this to set status, priority, dates, or any metadata on a page or task.

    Args:
        node_id: UUID of the node to update.
        properties: JSON string of properties to merge (e.g. '{"status": "done"}').
    """
    pool = get_pool()

    try:
        props = json.loads(properties)
    except json.JSONDecodeError:
        return "Error: properties must be valid JSON."

    result = await pool.execute("""
        UPDATE nodes
        SET properties = properties || $2::jsonb,
            updated_at = now()
        WHERE id = $1
    """, uuid.UUID(node_id), json.dumps(props))

    if result == "UPDATE 1":
        return f"Updated node {node_id} with {props}"
    return f"Node {node_id} not found or not updated."


@tool
async def append_text_to_page(
    node_id: str,
    text: str,
    owner_id: Optional[str] = None,
) -> str:
    """Append text as a paragraph block to a page.

    Args:
        node_id: UUID of the target page node.
        text: Text to append.
        owner_id: UUID of the owner. Required (injected by agent context).
    """
    if not owner_id:
        return "Error: owner_id is required to append page text."

    trimmed = text.strip()
    if not trimmed:
        return "Error: text cannot be empty."

    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT content, type::text
        FROM nodes
        WHERE id = $1 AND owner_id = $2
        """,
        uuid.UUID(node_id),
        uuid.UUID(owner_id),
    )
    if not row:
        return "Error: page not found or access denied."

    if row["type"] != "page":
        return f"Error: node {node_id} is type '{row['type']}', expected 'page'."

    content = row["content"] if isinstance(row["content"], list) else []
    updated_content = [*content, _build_paragraph_block(trimmed)]

    result = await pool.execute(
        """
        UPDATE nodes
        SET content = $2::jsonb,
            updated_at = now()
        WHERE id = $1 AND owner_id = $3
        """,
        uuid.UUID(node_id),
        json.dumps(updated_content),
        uuid.UUID(owner_id),
    )

    if result == "UPDATE 1":
        return f"Appended text to page {node_id}"
    return "Error: append failed."
