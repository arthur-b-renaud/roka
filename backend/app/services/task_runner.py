"""
Agent task poller: polls agent_tasks table for pending tasks,
runs LangGraph workflows, updates status.

This is the sidecar bridge:
  Frontend creates task row -> Poller picks up -> LangGraph executes -> DB updated -> Frontend sees result
"""

import asyncio
import logging
import traceback
from datetime import datetime, timezone

from app.config import settings
from app.db import get_pool
from graph.workflows.summarize import run_summarize_workflow
from graph.workflows.triage import run_triage_workflow

logger = logging.getLogger(__name__)

WORKFLOW_HANDLERS = {
    "summarize": run_summarize_workflow,
    "triage": run_triage_workflow,
}


async def poll_agent_tasks() -> None:
    """
    Infinite loop polling agent_tasks for status='pending'.
    Picks one task, runs it, updates status.
    """
    logger.info("Task poller started (interval=%ds)", settings.task_poll_interval_seconds)

    while True:
        try:
            pool = get_pool()

            # Atomically claim a pending task
            row = await pool.fetchrow("""
                UPDATE agent_tasks
                SET status = 'running', started_at = now(), updated_at = now()
                WHERE id = (
                    SELECT id FROM agent_tasks
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, workflow, input, node_id, owner_id
            """)

            if row is None:
                await asyncio.sleep(settings.task_poll_interval_seconds)
                continue

            task_id = row["id"]
            workflow = row["workflow"]
            task_input = row["input"]
            node_id = row["node_id"]
            owner_id = row["owner_id"]

            logger.info("Running task %s (workflow=%s)", task_id, workflow)

            handler = WORKFLOW_HANDLERS.get(workflow)
            if handler is None:
                await pool.execute("""
                    UPDATE agent_tasks
                    SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
                    WHERE id = $1
                """, task_id, f"Unknown workflow: {workflow}")
                continue

            try:
                result = await handler(
                    task_id=str(task_id),
                    node_id=str(node_id) if node_id else None,
                    owner_id=str(owner_id),
                    task_input=dict(task_input) if task_input else {},
                )

                await pool.execute("""
                    UPDATE agent_tasks
                    SET status = 'completed',
                        output = $2::jsonb,
                        completed_at = now(),
                        updated_at = now()
                    WHERE id = $1
                """, task_id, __import__("json").dumps(result or {}))

                logger.info("Task %s completed", task_id)

            except Exception as e:
                logger.error("Task %s failed: %s", task_id, str(e))
                await pool.execute("""
                    UPDATE agent_tasks
                    SET status = 'failed',
                        error = $2,
                        completed_at = now(),
                        updated_at = now()
                    WHERE id = $1
                """, task_id, f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}")

        except asyncio.CancelledError:
            logger.info("Task poller shutting down")
            raise
        except Exception as e:
            logger.error("Poller error: %s", str(e))
            await asyncio.sleep(settings.task_poll_interval_seconds)
