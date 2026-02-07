"""Webhook ingestion -- the only HTTP endpoint for external events."""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional
from app.db import get_supabase

router = APIRouter()


class WebhookPayload(BaseModel):
    channel: str = "webhook"
    direction: str = "inbound"
    from_email: Optional[str] = None
    subject: Optional[str] = None
    content_text: Optional[str] = None
    raw_payload: dict = {}


@router.post("/ingest")
async def ingest_webhook(payload: WebhookPayload):
    """
    Receive external event (email, Slack, etc).
    Parse, persist to communications, optionally create agent_task.
    """
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
    sb.table("communications").insert({
        "channel": payload.channel,
        "direction": payload.direction,
        "from_entity_id": entity_id,
        "subject": payload.subject,
        "content_text": payload.content_text,
        "raw_payload": payload.raw_payload,
    }).execute()

    return {"status": "received", "entity_id": entity_id}
