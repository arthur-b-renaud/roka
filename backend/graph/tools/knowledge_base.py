"""Knowledge base tools: search nodes, find entities, get communications."""

import uuid
from typing import Optional

from langchain_core.tools import tool

from app.db import get_pool


@tool
async def search_knowledge_base(
    query: str,
    limit: int = 10,
    owner_id: Optional[str] = None,
) -> str:
    """Search across all pages and databases in the workspace using full-text search.

    Use this to find relevant content by keywords or topics.
    Returns titles, types, and text snippets for matching nodes.

    Args:
        query: Search terms (natural language or keywords).
        limit: Max results to return (default 10).
        owner_id: UUID of the owner. Required (injected by agent context).
    """
    if not owner_id:
        return "Error: owner_id is required to search."

    pool = get_pool()
    rows = await pool.fetch("""
        SELECT n.id, n.title, n.type::text, n.parent_id,
               ts_headline('english', n.search_text, plainto_tsquery('english', $1),
                   'StartSel=**, StopSel=**, MaxWords=50, MinWords=20') AS snippet,
               ts_rank(to_tsvector('english', n.search_text),
                   plainto_tsquery('english', $1)) AS rank
        FROM nodes n
        WHERE n.owner_id = $3
          AND to_tsvector('english', n.search_text) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
    """, query, limit, uuid.UUID(owner_id))

    if not rows:
        # Fallback to trigram fuzzy search
        rows = await pool.fetch("""
            SELECT n.id, n.title, n.type::text, n.parent_id,
                   LEFT(n.search_text, 200) AS snippet,
                   similarity(n.search_text, $1) AS rank
            FROM nodes n
            WHERE n.owner_id = $3
              AND n.search_text %% $1
            ORDER BY rank DESC
            LIMIT $2
        """, query, limit, uuid.UUID(owner_id))

    if not rows:
        return "No results found."

    results = []
    for r in rows:
        results.append(
            f"- [{r['type']}] \"{r['title']}\" (id={r['id']})\n  {r['snippet']}"
        )
    return f"Found {len(rows)} results:\n" + "\n".join(results)


@tool
async def find_entities(
    name: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 10,
) -> str:
    """Find people, organizations, or bots in the workspace contacts.

    Use this to look up contacts by name or type before sending emails
    or referencing them in tasks.

    Args:
        name: Partial name to search for (fuzzy match). Optional.
        entity_type: Filter by 'person', 'org', or 'bot'. Optional.
        limit: Max results (default 10).
    """
    pool = get_pool()

    conditions = []
    args = []
    idx = 1

    if name:
        conditions.append(f"display_name ILIKE '%' || ${idx} || '%'")
        args.append(name)
        idx += 1

    if entity_type and entity_type in ("person", "org", "bot"):
        conditions.append(f"type = ${idx}::entity_type")
        args.append(entity_type)
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"
    args.append(limit)

    rows = await pool.fetch(f"""
        SELECT id, display_name, type::text, resolution_keys, metadata
        FROM entities
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ${idx}
    """, *args)

    if not rows:
        return "No entities found."

    results = []
    for r in rows:
        keys = r["resolution_keys"] or []
        email = next((k for k in keys if "@" in str(k)), None) if isinstance(keys, list) else None
        results.append(
            f"- {r['display_name']} ({r['type']}) id={r['id']}"
            + (f" email={email}" if email else "")
        )
    return f"Found {len(rows)} entities:\n" + "\n".join(results)


@tool
async def get_communications(
    entity_id: Optional[str] = None,
    channel: Optional[str] = None,
    limit: int = 5,
) -> str:
    """Fetch recent communications (emails, Slack messages, webhooks).

    Use this to review conversation history with a contact or check
    recent inbound signals.

    Args:
        entity_id: Filter by sender entity UUID. Optional.
        channel: Filter by channel ('email', 'slack', 'sms', 'webhook'). Optional.
        limit: Max results (default 5).
    """
    pool = get_pool()

    conditions = []
    args = []
    idx = 1

    if entity_id:
        conditions.append(f"from_entity_id = ${idx}")
        args.append(uuid.UUID(entity_id))
        idx += 1

    if channel and channel in ("email", "slack", "sms", "webhook", "other"):
        conditions.append(f"channel = ${idx}::comm_channel")
        args.append(channel)
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"
    args.append(limit)

    rows = await pool.fetch(f"""
        SELECT c.id, c.channel::text, c.direction::text, c.subject,
               LEFT(c.content_text, 300) AS content_preview, c.timestamp,
               e.display_name AS from_name
        FROM communications c
        LEFT JOIN entities e ON e.id = c.from_entity_id
        WHERE {where}
        ORDER BY c.timestamp DESC
        LIMIT ${idx}
    """, *args)

    if not rows:
        return "No communications found."

    results = []
    for r in rows:
        from_str = r["from_name"] or "Unknown"
        subj = r["subject"] or "(no subject)"
        results.append(
            f"- [{r['channel']}/{r['direction']}] From: {from_str} | Subject: {subj}\n"
            f"  {r['content_preview'] or '(empty)'}\n"
            f"  Time: {r['timestamp']}"
        )
    return f"Found {len(rows)} communications:\n" + "\n".join(results)
