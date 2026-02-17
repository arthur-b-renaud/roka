"""
Conversational ReAct agent with persistent memory, dynamic tools, and telemetry.

Leverages LangGraph's create_react_agent + AsyncPostgresSaver for multi-turn
conversations. Tools loaded dynamically from tool_definitions table.
Agent definitions configure persona, model, and available tools.
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import settings
from app.db import get_pool
from app.services.llm_settings import get_llm_config
from app.services.checkpointer import get_checkpointer
from app.services.telemetry import get_tracer, _TASK_ID_KEY, _OWNER_ID_KEY
from graph.tools.registry import load_tools_for_agent, wrap_tools_with_owner

logger = logging.getLogger(__name__)

_SENSITIVE_KEY_PATTERNS = (
    "token", "secret", "password", "api_key", "authorization", "cookie", "key",
)

DEFAULT_SYSTEM_PROMPT = """You are Roka, an AI workspace assistant. You help users manage their knowledge base, triage incoming information, and take actions.

## Your capabilities
- Search the workspace knowledge base (pages, databases, notes)
- Find and look up contacts (entities) and their communication history
- Create new pages and tasks in the workspace
- Update properties on existing pages (status, priority, dates, etc.)
- Use any external tools that have been configured (Gmail, Slack, search, etc.)

## Guidelines
- Always search the knowledge base first when a user asks about existing content.
- When creating tasks, set clear titles and relevant properties.
- Be concise and action-oriented. Summarize what you did after completing actions.
- If you lack information to complete a request, say so clearly rather than guessing.
"""


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(p in lowered for p in _SENSITIVE_KEY_PATTERNS)


def _redact_payload(value: Any) -> Any:
    """Best-effort redaction for execution traces."""
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for k, v in value.items():
            if _is_sensitive_key(str(k)):
                redacted[k] = "***REDACTED***"
            else:
                redacted[k] = _redact_payload(v)
        return redacted

    if isinstance(value, list):
        return [_redact_payload(v) for v in value]

    if isinstance(value, str):
        s = value[:4000]
        # redact bearer-like tokens and common key formats in free text
        s = re.sub(r"(?i)(bearer\\s+)[a-z0-9._\\-]+", r"\\1***REDACTED***", s)
        s = re.sub(r"(?i)(sk-[a-z0-9]{8,})", "***REDACTED***", s)
        return s

    return value


async def _build_model(
    model_override: str | None = None,
    api_key_override: str | None = None,
    api_base_override: str | None = None,
) -> ChatOpenAI:
    """Create a ChatOpenAI instance, optionally overriding from agent_definition config."""
    llm = await get_llm_config()
    if not llm.is_configured:
        raise ValueError("LLM not configured. Go to Settings to add your API key.")

    model = model_override or llm.model
    api_key = api_key_override or llm.api_key or "not-needed"
    base_url = api_base_override or llm.api_base or None

    if not base_url:
        if llm.provider == "ollama":
            base_url = "http://host.docker.internal:11434/v1"
        elif llm.provider == "openrouter":
            base_url = "https://openrouter.ai/api/v1"

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        timeout=settings.llm_timeout_seconds,
    )


async def _load_agent_definition(agent_def_id: str) -> Optional[dict[str, Any]]:
    """Load an agent definition from the DB."""
    pool = get_pool()
    row = await pool.fetchrow("""
        SELECT id, name, system_prompt, model, tool_ids, trigger::text, trigger_config
        FROM agent_definitions
        WHERE id = $1 AND is_active = true
    """, uuid.UUID(agent_def_id))
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "system_prompt": row["system_prompt"],
        "model": row["model"],
        "tool_ids": [str(t) for t in row["tool_ids"]] if row["tool_ids"] else [],
    }


async def _build_context(node_id: str | None, owner_id: str) -> str:
    """Build additional context from the target node and recent workspace activity."""
    parts = []
    pool = get_pool()

    if node_id:
        row = await pool.fetchrow(
            "SELECT title, search_text, properties FROM nodes WHERE id = $1",
            uuid.UUID(node_id),
        )
        if row:
            parts.append(
                f"## Current page context\n"
                f"Title: {row['title']}\n"
                f"Content: {(row['search_text'] or '')[:2000]}\n"
                f"Properties: {json.dumps(dict(row['properties'])) if row['properties'] else '{}'}"
            )

    recent = await pool.fetch("""
        SELECT title, type::text FROM nodes
        WHERE owner_id = $1 AND type IN ('page', 'database')
        ORDER BY updated_at DESC LIMIT 5
    """, uuid.UUID(owner_id))

    if recent:
        titles = [f"- [{r['type']}] {r['title']}" for r in recent]
        parts.append("## Recent workspace pages\n" + "\n".join(titles))

    return "\n\n".join(parts)


async def _save_message(
    conversation_id: str,
    role: str,
    content: str,
    task_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Persist a message to the conversation."""
    pool = get_pool()
    await pool.execute("""
        INSERT INTO messages (conversation_id, role, content, task_id, metadata)
        VALUES ($1, $2::message_role, $3, $4, $5::jsonb)
    """,
        uuid.UUID(conversation_id),
        role,
        content,
        uuid.UUID(task_id) if task_id else None,
        json.dumps(metadata or {}),
    )


async def _load_conversation_messages(conversation_id: str, limit: int = 50) -> list[dict]:
    """Load recent messages for a conversation."""
    pool = get_pool()
    rows = await pool.fetch("""
        SELECT role::text, content FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT $2
    """, uuid.UUID(conversation_id), limit)
    return [dict(r) for r in rows]


async def run_agent_workflow(
    task_id: str,
    node_id: str | None,
    owner_id: str,
    task_input: dict[str, Any],
) -> dict[str, Any]:
    """
    Entry point for the ReAct agent. Supports:
    - Multi-turn conversations via conversation_id
    - Custom agent definitions via agent_definition_id
    - Dynamic tool loading from DB
    - Persistent memory via LangGraph checkpointer
    - OpenTelemetry tracing
    """
    tracer = get_tracer()

    with tracer.start_as_current_span(
        "agent.workflow",
        attributes={_TASK_ID_KEY: task_id, _OWNER_ID_KEY: owner_id},
    ) as span:
        prompt = task_input.get("prompt", "")
        if not prompt:
            return {"error": "No prompt provided in task input."}

        conversation_id = task_input.get("conversation_id")
        agent_def_id = task_input.get("agent_definition_id")
        if not node_id:
            node_id = task_input.get("node_id") or None

        # Load agent definition if specified
        system_prompt = DEFAULT_SYSTEM_PROMPT
        model_override = None
        tool_ids = None

        if agent_def_id:
            with tracer.start_as_current_span("agent.load_definition"):
                agent_def = await _load_agent_definition(agent_def_id)
                if agent_def:
                    if agent_def["system_prompt"]:
                        system_prompt = agent_def["system_prompt"]
                    if agent_def["model"]:
                        model_override = agent_def["model"]
                    if agent_def["tool_ids"]:
                        tool_ids = agent_def["tool_ids"]

        # Build model
        try:
            with tracer.start_as_current_span("agent.build_model"):
                model = await _build_model(model_override=model_override)
        except ValueError as e:
            return {"error": str(e)}

        # Load tools dynamically from DB
        with tracer.start_as_current_span("agent.load_tools"):
            tools = await load_tools_for_agent(owner_id, tool_ids)
            tools = wrap_tools_with_owner(tools, owner_id)
            span.set_attribute("tool_count", len(tools))

        # Build context
        with tracer.start_as_current_span("agent.build_context"):
            context = await _build_context(node_id, owner_id)

        full_system = system_prompt
        if context:
            full_system += f"\n\n{context}"

        # Build message history for multi-turn
        messages = []
        if conversation_id:
            with tracer.start_as_current_span("agent.load_history"):
                history = await _load_conversation_messages(conversation_id)
                for msg in history:
                    if msg["role"] == "user":
                        messages.append(HumanMessage(content=msg["content"]))
                    elif msg["role"] == "assistant":
                        from langchain_core.messages import AIMessage
                        messages.append(AIMessage(content=msg["content"]))

        # Add current prompt
        messages.append(HumanMessage(content=prompt))

        # Save user message to conversation
        if conversation_id:
            await _save_message(conversation_id, "user", prompt, task_id)

        # Create agent with LangGraph checkpointer for persistent memory
        checkpointer = get_checkpointer()
        agent = create_react_agent(model, tools, prompt=full_system, checkpointer=checkpointer)

        # Thread config: conversation_id for multi-turn, or task_id for one-shot
        thread_id = conversation_id or task_id
        config = {"configurable": {"thread_id": thread_id}}

        with tracer.start_as_current_span("agent.invoke"):
            result = await agent.ainvoke(
                {"messages": messages},
                config=config,
            )

        # Extract final response + build execution trace.
        # result_messages includes the full history (input + new). We only trace
        # messages produced by *this* invocation: skip the first len(messages)
        # entries which are the input we sent.
        result_messages = result.get("messages", [])
        new_messages = result_messages[len(messages):]
        final_text = ""
        trace_log = []
        step = 0

        for msg in new_messages:
            msg_type = type(msg).__name__
            # Use message response_metadata timestamp when available,
            # fall back to wall-clock
            ts = datetime.now(timezone.utc).isoformat()

            # Tool call requests (AIMessage with tool_calls)
            tool_calls = getattr(msg, "tool_calls", None)
            if tool_calls:
                # Capture reasoning before tool calls if present
                if hasattr(msg, "content") and msg.content:
                    step += 1
                    trace_log.append({
                        "step": step,
                        "type": "thinking",
                        "content": _redact_payload(str(msg.content)),
                        "ts": ts,
                    })
                for tc in tool_calls:
                    step += 1
                    trace_log.append({
                        "step": step,
                        "type": "tool_call",
                        "tool": tc.get("name", "unknown"),
                        "input": _redact_payload(tc.get("args", {})),
                        "ts": ts,
                    })
                continue

            # Tool results
            if msg_type == "ToolMessage":
                step += 1
                trace_log.append({
                    "step": step,
                    "type": "tool_result",
                    "tool": getattr(msg, "name", "unknown"),
                    "output": _redact_payload(str(msg.content)) if hasattr(msg, "content") else "",
                    "ts": ts,
                })
                continue

            # Final AI response (no tool calls)
            if msg_type == "AIMessage" and hasattr(msg, "content") and msg.content:
                final_text = msg.content
                step += 1
                trace_log.append({
                    "step": step,
                    "type": "response",
                    "content": _redact_payload(str(msg.content)),
                    "ts": ts,
                })

        # Persist trace_log to agent_tasks
        pool = get_pool()
        trace_json = json.dumps(trace_log, default=str)
        await pool.execute("""
            UPDATE agent_tasks SET trace_log = $1::jsonb WHERE id = $2
        """, trace_json, uuid.UUID(task_id))

        # Save assistant response to conversation
        if conversation_id:
            await _save_message(
                conversation_id, "assistant", final_text, task_id,
                metadata={"model": model_override or "default"},
            )

        # Audit log
        await pool.execute("""
            INSERT INTO writes (task_id, table_name, row_id, operation, new_data, actor_type, actor_id)
            VALUES ($1, 'agent_tasks', $2, 'UPDATE', $3::jsonb, 'agent', $1)
        """,
            uuid.UUID(task_id),
            uuid.UUID(task_id),
            json.dumps({"response": final_text[:2000]}),
        )

        return {"response": final_text}
