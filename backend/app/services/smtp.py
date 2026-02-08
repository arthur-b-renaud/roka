"""SMTP helper: reads config from app_settings, sends email via aiosmtplib."""

import asyncio
import logging
import time
from dataclasses import dataclass
from email.message import EmailMessage

import aiosmtplib

from app.db import get_pool

logger = logging.getLogger(__name__)

_cache: "SMTPConfig | None" = None
_cache_ts: float = 0.0
_cache_lock: asyncio.Lock | None = None

CACHE_TTL = 60.0


def _get_lock() -> asyncio.Lock:
    global _cache_lock
    if _cache_lock is None:
        _cache_lock = asyncio.Lock()
    return _cache_lock


@dataclass
class SMTPConfig:
    host: str
    port: int
    user: str
    password: str
    from_email: str
    is_configured: bool

    @property
    def use_tls(self) -> bool:
        return self.port == 465

    @property
    def use_starttls(self) -> bool:
        return self.port in (587, 25)


async def get_smtp_config() -> SMTPConfig:
    """Read SMTP settings from app_settings with in-memory cache."""
    global _cache, _cache_ts

    now = time.monotonic()
    if _cache is not None and (now - _cache_ts) < CACHE_TTL:
        return _cache

    async with _get_lock():
        # Re-check inside lock
        if _cache is not None and (now - _cache_ts) < CACHE_TTL:
            return _cache

        try:
            pool = get_pool()
            rows = await pool.fetch(
                "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
                ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from_email"],
            )
            db = {row["key"]: row["value"] for row in rows}
        except Exception:
            logger.warning("Could not read SMTP settings from DB")
            db = {}

        host = db.get("smtp_host", "").strip()
        port_str = db.get("smtp_port", "587").strip()
        user = db.get("smtp_user", "").strip()
        password = db.get("smtp_password", "").strip()
        from_email = db.get("smtp_from_email", "").strip()

        try:
            port = int(port_str)
        except ValueError:
            port = 587

        is_configured = bool(host and from_email)

        _cache = SMTPConfig(
            host=host, port=port, user=user,
            password=password, from_email=from_email,
            is_configured=is_configured,
        )
        _cache_ts = now
        return _cache


async def send_smtp_email(to: str, subject: str, body: str) -> str:
    """Send an email via SMTP. Returns success/error message."""
    cfg = await get_smtp_config()
    if not cfg.is_configured:
        return "SMTP not configured. Go to Settings to add SMTP credentials."

    msg = EmailMessage()
    msg["From"] = cfg.from_email
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        await aiosmtplib.send(
            msg,
            hostname=cfg.host,
            port=cfg.port,
            username=cfg.user if cfg.user else None,
            password=cfg.password if cfg.password else None,
            use_tls=cfg.use_tls,
            start_tls=cfg.use_starttls,
        )
        return f"Email sent to {to} with subject \"{subject}\""
    except Exception as e:
        logger.error("SMTP send failed: %s", e)
        return f"Failed to send email: {type(e).__name__}: {str(e)}"
