"""
OpenTelemetry integration: traces stored in PostgreSQL.

Lightweight OTel setup that exports spans to the telemetry_spans table.
No external collector needed -- fully sovereign observability.
"""

import json
import logging
import uuid
from typing import Optional, Sequence

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult, SimpleSpanProcessor
from opentelemetry.trace import StatusCode

from app.db import get_pool

logger = logging.getLogger(__name__)

# Context var to attach task_id / owner_id to spans
_TASK_ID_KEY = "roka.task_id"
_OWNER_ID_KEY = "roka.owner_id"


class PostgresSpanExporter(SpanExporter):
    """Exports OTel spans to the telemetry_spans table in PostgreSQL."""

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        """Sync export -- not used (we use async flush)."""
        # SimpleSpanProcessor calls this synchronously, but we batch async instead
        import asyncio
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._async_export(spans))
        except RuntimeError:
            # No running loop -- skip
            pass
        return SpanExportResult.SUCCESS

    async def _async_export(self, spans: Sequence[ReadableSpan]) -> None:
        try:
            pool = get_pool()
            for span in spans:
                attrs = dict(span.attributes or {})
                task_id = attrs.pop(_TASK_ID_KEY, None)
                owner_id = attrs.pop(_OWNER_ID_KEY, None)

                # Convert timestamps from nanoseconds to datetime
                start_ns = span.start_time or 0
                end_ns = span.end_time or 0
                duration_ms = (end_ns - start_ns) / 1_000_000 if end_ns and start_ns else None

                events = []
                for ev in (span.events or []):
                    events.append({
                        "name": ev.name,
                        "timestamp": ev.timestamp,
                        "attributes": dict(ev.attributes or {}),
                    })

                status = "OK"
                if span.status and span.status.status_code == StatusCode.ERROR:
                    status = "ERROR"

                parent_span_id = None
                if span.parent and hasattr(span.parent, "span_id"):
                    parent_span_id = format(span.parent.span_id, "016x")

                await pool.execute("""
                    INSERT INTO telemetry_spans
                        (trace_id, span_id, parent_span_id, name, kind, status,
                         start_time, end_time, duration_ms, attributes, events,
                         task_id, owner_id)
                    VALUES ($1, $2, $3, $4, $5, $6,
                            to_timestamp($7::double precision / 1e9),
                            to_timestamp($8::double precision / 1e9),
                            $9, $10::jsonb, $11::jsonb, $12, $13)
                """,
                    format(span.context.trace_id, "032x"),
                    format(span.context.span_id, "016x"),
                    parent_span_id,
                    span.name,
                    span.kind.name if span.kind else "INTERNAL",
                    status,
                    float(start_ns),
                    float(end_ns),
                    duration_ms,
                    json.dumps(attrs, default=str),
                    json.dumps(events, default=str),
                    uuid.UUID(task_id) if task_id else None,
                    uuid.UUID(owner_id) if owner_id else None,
                )
        except Exception as e:
            logger.warning("Failed to export telemetry spans: %s", e)

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


_tracer: Optional[trace.Tracer] = None


def init_telemetry() -> trace.Tracer:
    """Initialize OTel with Postgres exporter. Call once at startup."""
    global _tracer
    provider = TracerProvider()
    exporter = PostgresSpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer("roka.agent")
    logger.info("OpenTelemetry initialized (PostgreSQL exporter)")
    return _tracer


def get_tracer() -> trace.Tracer:
    if _tracer is None:
        return trace.get_tracer("roka.agent")
    return _tracer
