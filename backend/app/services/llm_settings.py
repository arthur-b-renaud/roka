"""
LLM configuration service: reads provider/model/key from app_settings table.
Caches in memory with TTL to avoid hitting DB on every LLM call.
Falls back to env var LITELLM_MODEL when DB has no config.
"""

import asyncio
import logging
import time
from dataclasses import dataclass

from app.config import settings
from app.db import get_pool

logger = logging.getLogger(__name__)

_cache: "LLMConfig | None" = None
_cache_ts: float = 0.0
_cache_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    """Lazy-create the lock (must be in a running event loop)."""
    global _cache_lock
    if _cache_lock is None:
        _cache_lock = asyncio.Lock()
    return _cache_lock


@dataclass
class LLMConfig:
    provider: str  # "openai", "ollama", "openrouter"
    model: str  # "gpt-4o", "llama3", etc.
    api_key: str  # provider API key
    api_base: str  # optional base URL (for ollama/local)
    is_configured: bool  # True if api_key is non-empty (or ollama which needs no key)

    @property
    def model_string(self) -> str:
        """Full model identifier for litellm, e.g. 'openai/gpt-4o'."""
        return f"{self.provider}/{self.model}"


async def get_llm_config() -> LLMConfig:
    """Return current LLM config, reading from DB with in-memory cache (lock-protected)."""
    global _cache, _cache_ts

    now = time.monotonic()
    if _cache is not None and (now - _cache_ts) < settings.llm_cache_ttl_seconds:
        return _cache

    async with _get_lock():
        # Double-check after acquiring lock
        now = time.monotonic()
        if _cache is not None and (now - _cache_ts) < settings.llm_cache_ttl_seconds:
            return _cache

        try:
            pool = get_pool()
            rows = await pool.fetch(
                "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
                ["llm_provider", "llm_model", "llm_api_key", "llm_api_base"],
            )
            db_settings = {row["key"]: row["value"] for row in rows}
        except Exception:
            logger.warning("Could not read LLM settings from DB, using env fallback")
            db_settings = {}

        provider = db_settings.get("llm_provider", "").strip()
        model = db_settings.get("llm_model", "").strip()
        api_key = db_settings.get("llm_api_key", "").strip()
        api_base = db_settings.get("llm_api_base", "").strip()

        # Fallback to env var if DB has no meaningful config
        if not provider or not model:
            fallback = settings.litellm_model  # e.g. "openai/gpt-4o"
            parts = fallback.split("/", 1)
            provider = parts[0] if len(parts) == 2 else "openai"
            model = parts[1] if len(parts) == 2 else fallback

        is_configured = bool(api_key) or provider == "ollama"

        _cache = LLMConfig(
            provider=provider,
            model=model,
            api_key=api_key,
            api_base=api_base,
            is_configured=is_configured,
        )
        _cache_ts = now
        return _cache


def invalidate_cache() -> None:
    """Force next call to re-read from DB."""
    global _cache, _cache_ts
    _cache = None
    _cache_ts = 0.0
