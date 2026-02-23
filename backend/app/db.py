"""Database client: AsyncPG pool.

Initialized once at startup (via lifespan) to avoid race conditions.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from app.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Create asyncpg pool. Called once at startup."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
    )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized -- was init_pool() called at startup?")
    return _pool


@asynccontextmanager
async def with_actor(
    actor_type: str, actor_id: str
) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection with actor attribution set for node_revisions trigger.

    SET LOCAL is transaction-scoped, so values never leak to other callers
    sharing the pool.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('roka.actor_type', $1, true)", actor_type
            )
            await conn.execute(
                "SELECT set_config('roka.actor_id', $1, true)", actor_id
            )
            yield conn
