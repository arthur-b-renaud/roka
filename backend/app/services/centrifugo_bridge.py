"""
Bridge: Postgres LISTEN/NOTIFY -> Centrifugo publish.
Single connection listens; N browser tabs connect to Centrifugo instead of DB.
"""

import asyncio
import logging

import httpx

from app.config import settings
from app.db import get_pool

logger = logging.getLogger(__name__)

# Exponential backoff: 1s, 2s, 4s, ..., max 60s
BRIDGE_RECONNECT_BASE = 1.0
BRIDGE_RECONNECT_MAX = 60.0


async def _publish(channel: str, payload: str) -> None:
    """Publish notification to Centrifugo. Fire-and-forget."""
    if not settings.centrifugo_api_key:
        return
    async with httpx.AsyncClient(base_url=settings.centrifugo_api_url, timeout=5.0) as client:
        try:
            r = await client.post(
                "/api/publish",
                json={"channel": channel, "data": {"channel": channel, "payload": payload}},
                headers={"Authorization": f"apikey {settings.centrifugo_api_key}"},
            )
            if r.status_code != 200:
                logger.warning("Centrifugo publish failed: %s %s", r.status_code, r.text)
        except Exception as e:
            logger.warning("Centrifugo publish error: %s", e)


def _on_notify(conn, pid, channel: str, payload: str) -> None:
    """Sync callback for asyncpg — schedule async publish."""
    asyncio.create_task(_publish(channel, payload))


async def centrifugo_bridge() -> None:
    """
    LISTEN to Postgres channels, publish to Centrifugo.
    Reconnects with exponential backoff on failure.
    """
    if not settings.centrifugo_api_key:
        logger.info("Centrifugo bridge disabled (no API key)")
        return

    pool = get_pool()
    backoff = BRIDGE_RECONNECT_BASE

    while True:
        conn = None
        try:
            conn = await pool.acquire()
            await conn.add_listener("new_task", _on_notify)
            await conn.add_listener("new_message", _on_notify)
            logger.info("Centrifugo bridge listening (new_task, new_message)")
            backoff = BRIDGE_RECONNECT_BASE

            # Keep connection alive until cancelled
            while True:
                await asyncio.sleep(3600)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("Centrifugo bridge error, reconnecting in %.0fs: %s", backoff, e)
        finally:
            if conn:
                try:
                    await conn.remove_listener("new_task", _on_notify)
                    await conn.remove_listener("new_message", _on_notify)
                except Exception:
                    pass
                await pool.release(conn)

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, BRIDGE_RECONNECT_MAX)
