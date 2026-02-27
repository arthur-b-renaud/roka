"""Webhook ingestion -- the only HTTP endpoint for external events."""

import json
import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from app.db import get_pool
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


class WebhookPayload(BaseModel):
    channel: str = "webhook"
    direction: str = "inbound"
    from_email: Optional[str] = None
    subject: Optional[str] = None
    content_text: Optional[str] = None
    raw_payload: dict = Field(default_factory=dict)
    auto_triage: bool = True


@router.post("/ingest")
async def ingest_webhook(
    payload: WebhookPayload,
    x_roka_webhook_secret: Optional[str] = Header(default=None, alias="X-Roka-Webhook-Secret"),
):
    """
    Receive external event (email, Slack, etc).
    Parse, persist to communications, auto-trigger agent triage.
    """
    if settings.webhook_secret:
        if not x_roka_webhook_secret or not secrets.compare_digest(
            x_roka_webhook_secret, settings.webhook_secret
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook secret",
            )

    pool = get_pool()

    # Resolve entity by email if provided
    entity_id = None
    if payload.from_email:
        row = await pool.fetchrow(
            "SELECT id FROM entities WHERE resolution_keys @> $1::jsonb",
            json.dumps([payload.from_email]),
        )
        if row:
            entity_id = str(row["id"])
        else:
            new_row = await pool.fetchrow(
                """INSERT INTO entities (display_name, type, resolution_keys)
                   VALUES ($1, 'person', $2::jsonb)
                   RETURNING id""",
                payload.from_email,
                json.dumps([payload.from_email]),
            )
            if new_row:
                entity_id = str(new_row["id"])

    # Persist to communications
    await pool.execute(
        """INSERT INTO communications
           (channel, direction, from_entity_id, subject, content_text, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)""",
        payload.channel,
        payload.direction,
        entity_id,
        payload.subject,
        payload.content_text,
        json.dumps(payload.raw_payload),
    )

    # Auto-create agent task for inbound triage
    task_id = None
    if payload.auto_triage and payload.direction == "inbound":
        try:
            owner_row = await pool.fetchrow(
                "SELECT owner_id FROM nodes ORDER BY created_at ASC LIMIT 1"
            )
            if owner_row:
                from_str = payload.from_email or "unknown"
                subject_str = payload.subject or "(no subject)"
                prompt = (
                    f"Triage this inbound {payload.channel} from {from_str}.\n"
                    f"Subject: {subject_str}\n"
                    f"Content: {(payload.content_text or '')[:2000]}\n\n"
                    f"Classify it, extract relevant entities and dates, "
                    f"and create appropriate tasks or notes in the workspace."
                )
                task_row = await pool.fetchrow("""
                    INSERT INTO agent_tasks (owner_id, workflow, input)
                    VALUES ($1, 'agent', $2::jsonb)
                    RETURNING id
                """,
                    owner_row["owner_id"],
                    json.dumps({
                        "prompt": prompt,
                        "source": "webhook",
                        "channel": payload.channel,
                        "entity_id": entity_id,
                    }),
                )
                if task_row:
                    task_id = str(task_row["id"])
                    logger.info("Auto-created agent task %s for inbound %s", task_id, payload.channel)
        except Exception as e:
            logger.error("Failed to auto-create agent task: %s", e)

    return {"status": "received", "entity_id": entity_id, "task_id": task_id}
