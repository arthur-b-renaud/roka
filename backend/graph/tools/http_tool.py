"""
Generic HTTP tool: calls external APIs with credential injection.

Config schema (stored in tool_definitions.config JSONB):
{
    "url": "https://api.example.com/endpoint",
    "method": "POST",
    "headers_template": {"Authorization": "Bearer {{credential.api_key}}"},
    "body_template": {"message": "{{input.text}}"},
    "description": "Call the Example API"
}
"""

import logging
import re
from typing import Any, Optional

import httpx
from langchain_core.tools import StructuredTool

from app.services.vault import get_credential_decrypted

logger = logging.getLogger(__name__)


def _interpolate(template: Any, context: dict[str, Any]) -> Any:
    """Replace {{key.subkey}} placeholders in a template with context values."""
    if isinstance(template, str):
        def replace_match(match: re.Match) -> str:
            path = match.group(1).strip()
            parts = path.split(".")
            value = context
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part, "")
                else:
                    return ""
            return str(value) if value is not None else ""

        return re.sub(r"\{\{(.+?)\}\}", replace_match, template)

    elif isinstance(template, dict):
        return {k: _interpolate(v, context) for k, v in template.items()}
    elif isinstance(template, list):
        return [_interpolate(v, context) for v in template]
    return template


async def build_http_tool(
    name: str,
    config: dict[str, Any],
    credential_id: Optional[str] = None,
) -> StructuredTool:
    """
    Build a LangChain StructuredTool that makes an HTTP call.
    Credential is fetched and decrypted at call time.
    """
    url_template = config.get("url", "")
    method = config.get("method", "GET").upper()
    headers_template = config.get("headers_template", {})
    body_template = config.get("body_template", None)
    description = config.get("description", f"Call {name} HTTP API")

    async def _call_http(input_text: str = "") -> str:
        """Execute HTTP tool call with credential injection."""
        # Build interpolation context
        context: dict[str, Any] = {"input": {"text": input_text}}

        if credential_id:
            try:
                cred = await get_credential_decrypted(credential_id)
                context["credential"] = cred["config"]
            except Exception as e:
                return f"Error loading credential: {e}"

        url = _interpolate(url_template, context)
        headers = _interpolate(headers_template, context)
        body = _interpolate(body_template, context) if body_template else None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if body else None,
                )
                if response.status_code >= 400:
                    return f"HTTP {response.status_code}: {response.text[:500]}"
                return response.text[:2000]
        except Exception as e:
            return f"HTTP request failed: {type(e).__name__}: {str(e)}"

    return StructuredTool.from_function(
        coroutine=_call_http,
        name=name,
        description=description,
    )
