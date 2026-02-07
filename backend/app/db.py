"""Database clients: AsyncPG pool + Supabase service-role client.

Both are initialized once at startup (via lifespan) to avoid race conditions.
"""

import asyncpg
from supabase import create_client, Client as SupabaseClient
from app.config import settings

# Module-level references, initialized once at app startup (single-writer, safe in async)
_pool: asyncpg.Pool | None = None
_supabase: SupabaseClient | None = None


async def init_pool() -> asyncpg.Pool:
    """Create asyncpg pool and Supabase client. Called once at startup."""
    global _pool, _supabase
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
    )
    _supabase = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
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


def get_supabase() -> SupabaseClient:
    """Return the Supabase client initialized at startup."""
    if _supabase is None:
        raise RuntimeError("Supabase client not initialized -- was init_pool() called at startup?")
    return _supabase
