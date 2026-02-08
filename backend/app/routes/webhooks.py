"""Webhook ingestion -- the only HTTP endpoint for external events."""

import json
import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from app.db import get_supabase, get_pool
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
    auto_triage: bool = True  # Auto-create agent task for inbound


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

    sb = get_supabase()

    # Resolve entity by email if provided
    entity_id = None
    if payload.from_email:
        result = sb.table("entities").select("id").contains(
            "resolution_keys", [payload.from_email]
        ).execute()
        if result.data:
            entity_id = result.data[0]["id"]
        else:
            # Create new entity
            new_entity = sb.table("entities").insert({
                "display_name": payload.from_email,
                "type": "person",
                "resolution_keys": [payload.from_email],
            }).execute()
            if new_entity.data:
                entity_id = new_entity.data[0]["id"]

    # Persist to communications
    comm_result = sb.table("communications").insert({
        "channel": payload.channel,
        "direction": payload.direction,
        "from_entity_id": entity_id,
        "subject": payload.subject,
        "content_text": payload.content_text,
        "raw_payload": payload.raw_payload,
    }).execute()

    # Auto-create agent task for inbound triage
    task_id = None
    if payload.auto_triage and payload.direction == "inbound":
        try:
            pool = get_pool()
            # Find any workspace owner to assign the task to
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
                        "entity_id": str(entity_id) if entity_id else None,
                    }),
                )
                if task_row:
                    task_id = str(task_row["id"])
                    logger.info("Auto-created agent task %s for inbound %s", task_id, payload.channel)
        except Exception as e:
            logger.error("Failed to auto-create agent task: %s", e)

    return {"status": "received", "entity_id": entity_id, "task_id": task_id}
