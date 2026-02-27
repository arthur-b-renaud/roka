"""
LLM configuration service: reads from credentials table (service='llm'),
falls back to app_settings for backward compatibility, then to env vars.
Caches in memory with TTL.
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
    global _cache_lock
    if _cache_lock is None:
        _cache_lock = asyncio.Lock()
    return _cache_lock


@dataclass
class LLMConfig:
    provider: str
    model: str
    api_key: str
    api_base: str
    is_configured: bool

    @property
    def model_string(self) -> str:
        return f"{self.provider}/{self.model}"


async def get_llm_config() -> LLMConfig:
    """Return current LLM config. Reads from credentials table first, then app_settings fallback."""
    global _cache, _cache_ts

    now = time.monotonic()
    if _cache is not None and (now - _cache_ts) < settings.llm_cache_ttl_seconds:
        return _cache

    async with _get_lock():
        now = time.monotonic()
        if _cache is not None and (now - _cache_ts) < settings.llm_cache_ttl_seconds:
            return _cache

        pool = get_pool()
        provider = ""
        model = ""
        api_key = ""
        api_base = ""

        # Try credentials table first (new vault-based approach)
        try:
            from app.services.vault import decrypt
            cred_row = await pool.fetchrow("""
                SELECT config_encrypted FROM credentials
                WHERE service = 'llm' AND is_active = true
                ORDER BY updated_at DESC LIMIT 1
            """)
            if cred_row and cred_row["config_encrypted"]:
                config = decrypt(cred_row["config_encrypted"])
                provider = config.get("provider", "")
                model = config.get("model", "")
                api_key = config.get("api_key", "")
                api_base = config.get("api_base", "")
        except Exception:
            pass  # Fall through to app_settings

        # Fallback to app_settings (backward compat)
        if not provider or not model:
            try:
                rows = await pool.fetch(
                    "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
                    ["llm_provider", "llm_model", "llm_api_key", "llm_api_base"],
                )
                db_settings = {row["key"]: row["value"] for row in rows}
                if not provider:
                    provider = db_settings.get("llm_provider", "").strip()
                if not model:
                    model = db_settings.get("llm_model", "").strip()
                if not api_key:
                    api_key = db_settings.get("llm_api_key", "").strip()
                if not api_base:
                    api_base = db_settings.get("llm_api_base", "").strip()
            except Exception:
                logger.warning("Could not read LLM settings from DB, using env fallback")

        # Final fallback to env var
        if not provider or not model:
            fallback = settings.litellm_model
            parts = fallback.split("/", 1)
            provider = parts[0] if len(parts) == 2 else "openai"
            model = parts[1] if len(parts) == 2 else fallback

        is_configured = bool(api_key) or provider == "ollama"

        _cache = LLMConfig(
            provider=provider, model=model,
            api_key=api_key, api_base=api_base,
            is_configured=is_configured,
        )
        _cache_ts = now
        return _cache


def invalidate_cache() -> None:
    global _cache, _cache_ts
    _cache = None
    _cache_ts = 0.0
