"""
Generic platform tool loader: dynamically imports any LangChain community
toolkit from config stored in tool_definitions.config JSONB.

No hardcoded providers. Everything is data-driven.

Expected config shape (tool_definitions.config):
{
    "toolkit": "langchain_google_community.gmail.toolkit.GmailToolkit",
    "tool_name": "send_gmail_message",          // optional -- omit to load ALL tools from toolkit
    "credential_service": "google",             // matches credentials.service
    "auth": {
        "type": "google_resource",              // how to transform the token
        "kwarg": "api_resource"                 // constructor kwarg for the toolkit
    }
}

Auth types:
    token          -- pass token string as-is to kwarg
    api_key        -- alias for token (semantic clarity)
    google_resource-- build googleapiclient Resource from OAuth token
    env            -- set token as env var named by kwarg before import
"""

import importlib
import logging
import os
from typing import Any, Optional

from langchain_core.tools import BaseTool

from app.services.vault import ensure_valid_token, get_credentials_by_service

logger = logging.getLogger(__name__)


async def build_platform_tool(
    name: str,
    config: dict[str, Any],
    owner_id: str,
) -> Optional[BaseTool | list[BaseTool]]:
    """
    Build one or more LangChain tools from a toolkit class stored in config.
    Returns a single BaseTool, a list, or None if credential is missing.
    """
    toolkit_path = config.get("toolkit")
    if not toolkit_path:
        logger.warning("Platform tool %s has no 'toolkit' in config", name)
        return None

    credential_service = config.get("credential_service", "")
    auth_cfg = config.get("auth", {})
    auth_type = auth_cfg.get("type", "token")
    auth_kwarg = auth_cfg.get("kwarg", "")
    tool_name = config.get("tool_name", "")

    # Resolve credential if service is specified
    token: str | None = None
    if credential_service:
        creds_list = await get_credentials_by_service(credential_service, owner_id)
        if not creds_list:
            logger.info(
                "No '%s' credential for owner %s, skipping platform tool %s",
                credential_service, owner_id, name,
            )
            return None
        cred_id = creds_list[0]["id"]
        try:
            token = await ensure_valid_token(cred_id, owner_id)
        except Exception as e:
            logger.warning("Token refresh failed for %s: %s", name, e)
            return None
        if not token:
            return None

    # Build toolkit init kwargs
    init_kwargs: dict[str, Any] = {}
    if token and auth_kwarg:
        init_kwargs[auth_kwarg] = _transform_token(token, auth_type)

    # Handle env-based auth (set env var, toolkit reads it on import)
    if auth_type == "env" and auth_kwarg and token:
        os.environ[auth_kwarg] = token

    try:
        toolkit_cls = _import_class(toolkit_path)
        toolkit = toolkit_cls(**init_kwargs)
        all_tools = toolkit.get_tools()
    except Exception as e:
        logger.warning("Failed to instantiate toolkit %s: %s", toolkit_path, e)
        return None
    finally:
        if auth_type == "env" and auth_kwarg:
            os.environ.pop(auth_kwarg, None)

    if not all_tools:
        logger.warning("Toolkit %s returned no tools", toolkit_path)
        return None

    # Return specific tool or first if tool_name is set; all tools otherwise
    if tool_name:
        for t in all_tools:
            if t.name == tool_name:
                return t
        available = [t.name for t in all_tools]
        logger.warning(
            "Toolkit %s has no tool '%s'. Available: %s",
            toolkit_path, tool_name, available,
        )
        return None

    return all_tools


def _import_class(dotted_path: str) -> type:
    """Import a class from a dotted module path like 'pkg.mod.ClassName'."""
    module_path, _, class_name = dotted_path.rpartition(".")
    if not module_path:
        raise ImportError(f"Invalid toolkit path: {dotted_path}")
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name, None)
    if cls is None:
        raise ImportError(f"{class_name} not found in {module_path}")
    return cls


def _transform_token(token: str, auth_type: str) -> Any:
    """Transform raw token string into the format expected by the toolkit."""
    if auth_type == "google_resource":
        from google.oauth2.credentials import Credentials
        from langchain_google_community.gmail.utils import build_gmail_service

        creds = Credentials(token=token)
        return build_gmail_service(credentials=creds)

    # token / api_key / default -- pass through as string
    return token
