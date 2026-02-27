#!/usr/bin/env python3
"""
Minimal learning script: append text to a page.

Why this exists:
- Show the smallest useful "agent-like" write path.
- Read page content from DB, append one BlockNote paragraph, write back.
- Enforce owner scoping in the SQL WHERE clause.

Usage:
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  python backend/scripts/minimal_page_agent.py \
    --owner-id <owner_uuid> \
    --node-id <page_uuid> \
    --text "Appended from minimal script."
"""

import argparse
import asyncio
import json
import os
import sys
import uuid
from typing import Any

try:
    import asyncpg
except ImportError:
    print("ERROR: asyncpg not installed. Run: pip install asyncpg")
    sys.exit(1)


def _make_paragraph_block(text: str) -> dict[str, Any]:
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


async def append_text_to_page(
    conn: asyncpg.Connection,
    owner_id: uuid.UUID,
    node_id: uuid.UUID,
    text: str,
) -> str:
    row = await conn.fetchrow(
        """
        SELECT content
        FROM nodes
        WHERE id = $1 AND owner_id = $2
        """,
        node_id,
        owner_id,
    )
    if row is None:
        return "Node not found or access denied."

    raw_content = row["content"]
    if isinstance(raw_content, list):
        content = raw_content
    else:
        # Defensive fallback if malformed content exists.
        content = []

    updated_content = [*content, _make_paragraph_block(text)]

    result = await conn.execute(
        """
        UPDATE nodes
        SET content = $1::jsonb, updated_at = now()
        WHERE id = $2 AND owner_id = $3
        """,
        json.dumps(updated_content),
        node_id,
        owner_id,
    )
    if result != "UPDATE 1":
        return "Failed to update page."

    return f"Appended text to node {node_id}."


async def main() -> int:
    parser = argparse.ArgumentParser(description="Append text to a page as minimal agent demo.")
    parser.add_argument("--owner-id", required=True, help="Owner UUID")
    parser.add_argument("--node-id", required=True, help="Page node UUID")
    parser.add_argument("--text", required=True, help="Text to append as a new paragraph")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    try:
        owner_id = uuid.UUID(args.owner_id)
        node_id = uuid.UUID(args.node_id)
    except ValueError:
        print("ERROR: --owner-id and --node-id must be valid UUIDs.")
        return 1

    conn = await asyncpg.connect(database_url)
    try:
        message = await append_text_to_page(conn, owner_id, node_id, args.text.strip())
        print(message)
        return 0 if message.startswith("Appended text") else 1
    finally:
        await conn.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
