"""
LangGraph checkpointer: AsyncPostgresSaver for persistent agent memory.

Uses psycopg (v3) async connection -- separate from the asyncpg pool
used by the rest of the app. LangGraph requires psycopg with
autocommit=True and dict_row factory.
"""

import logging
from typing import Optional

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import settings

logger = logging.getLogger(__name__)

_checkpointer: Optional[AsyncPostgresSaver] = None


async def init_checkpointer() -> AsyncPostgresSaver:
    """Initialize the LangGraph PostgreSQL checkpointer. Call once at startup."""
    global _checkpointer

    # Convert asyncpg-style DSN to psycopg format if needed
    dsn = settings.database_url
    if dsn.startswith("postgresql://"):
        dsn = dsn.replace("postgresql://", "postgresql://", 1)

    conn = await AsyncConnection.connect(
        dsn,
        autocommit=True,
        row_factory=dict_row,
    )
    _checkpointer = AsyncPostgresSaver(conn)
    await _checkpointer.setup()
    logger.info("LangGraph checkpointer initialized (AsyncPostgresSaver)")
    return _checkpointer


def get_checkpointer() -> AsyncPostgresSaver:
    if _checkpointer is None:
        raise RuntimeError("Checkpointer not initialized -- was init_checkpointer() called?")
    return _checkpointer


async def close_checkpointer() -> None:
    global _checkpointer
    if _checkpointer is not None:
        # Close the underlying psycopg connection
        if hasattr(_checkpointer, "conn") and _checkpointer.conn:
            await _checkpointer.conn.close()
        _checkpointer = None
