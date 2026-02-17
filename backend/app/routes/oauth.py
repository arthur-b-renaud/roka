"""
OAuth callback: exchange authorization code for tokens, store encrypted in vault.
Called by Next.js frontend after user returns from provider consent.
"""

import logging
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.services.vault import create_credential

router = APIRouter()
logger = logging.getLogger(__name__)


class OAuthExchangeRequest(BaseModel):
    provider: str = Field(..., pattern="^(google|slack)$")
    code: str = Field(..., min_length=1)
    redirect_uri: str = Field(..., min_length=1)
    user_id: str = Field(..., min_length=1)
    state: str | None = None


def _get_oauth_config(provider: str) -> tuple[str, str, str, str, list[str]]:
    """Returns (client_id, client_secret, token_url, scope_str, default_scopes)."""
    if provider == "google":
        cid = settings.google_oauth_client_id
        csec = settings.google_oauth_client_secret
        token_url = "https://oauth2.googleapis.com/token"
        scopes = ["https://mail.google.com/"]
        return cid, csec, token_url, " ".join(scopes), scopes
    if provider == "slack":
        cid = settings.slack_oauth_client_id
        csec = settings.slack_oauth_client_secret
        token_url = "https://slack.com/api/oauth.v2.access"
        scopes = ["chat:write", "channels:read", "users:read"]
        return cid, csec, token_url, ",".join(scopes), scopes
    raise ValueError(f"Unknown provider: {provider}")


async def _exchange_google(code: str, redirect_uri: str, client_id: str, client_secret: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        return r.json()


async def _exchange_slack(code: str, redirect_uri: str, client_id: str, client_secret: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        data = r.json()
    if not data.get("ok"):
        raise ValueError(data.get("error", "Slack OAuth failed"))
    return data


@router.post("/exchange")
async def exchange_oauth(req: OAuthExchangeRequest):
    """
    Exchange OAuth authorization code for tokens, encrypt and store in credentials.
    Called by frontend callback after user returns from provider consent.
    """
    provider = req.provider
    client_id, client_secret, _token_url, _scope, _ = _get_oauth_config(provider)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OAuth for {provider} not configured (client_id/secret missing)",
        )

    try:
        if provider == "google":
            data = await _exchange_google(req.code, req.redirect_uri, client_id, client_secret)
            expires_at = None
            if "expires_in" in data:
                exp = datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
                expires_at = exp.isoformat()
            config = {
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", ""),
                "expires_at": expires_at,
                "token_uri": "https://oauth2.googleapis.com/token",
                "client_id": client_id,
                "client_secret": client_secret,
                "scopes": data.get("scope", "").split() if data.get("scope") else [],
            }
            service = "google"
            cred_name = "Google (Gmail)"
        elif provider == "slack":
            data = await _exchange_slack(req.code, req.redirect_uri, client_id, client_secret)
            expires_at = None
            if "expires_in" in data:
                exp = datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
                expires_at = exp.isoformat()
            config = {
                "access_token": data.get("access_token", ""),
                "refresh_token": data.get("refresh_token", ""),
                "expires_at": expires_at,
                "client_id": client_id,
                "client_secret": client_secret,
            }
            service = "slack"
            cred_name = "Slack Workspace"
        else:
            raise HTTPException(status_code=400, detail="Unsupported provider")
    except httpx.HTTPStatusError as e:
        logger.warning("OAuth exchange failed: %s", e.response.text)
        raise HTTPException(status_code=400, detail="OAuth exchange failed")
    except ValueError as e:
        logger.warning("OAuth exchange error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    row = await create_credential(
        owner_id=req.user_id,
        name=cred_name,
        service=service,
        cred_type="oauth2",
        config=config,
    )
    return {"status": "ok", "credential": row}
