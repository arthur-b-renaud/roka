"""Database clients: AsyncPG pool + Supabase service-role client."""

import asyncpg
from supabase import create_client, Client as SupabaseClient
from app.config import settings

# Module-level references, initialized at app startup
_pool: asyncpg.Pool | None = None
_supabase: SupabaseClient | None = None


async def init_pool() -> asyncpg.Pool:
    """Create and return the asyncpg connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
    )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


def get_supabase() -> SupabaseClient:
    """Lazy-init Supabase client with SERVICE_ROLE key."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _supabase
