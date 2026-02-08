"""
Agent task poller: uses LISTEN/NOTIFY to wake on new tasks,
with polling fallback for stale task recovery.

Sidecar bridge:
  Frontend creates task row -> NOTIFY wakes poller -> LangGraph executes -> DB updated -> UI sees result
"""

import asyncio
import json
import logging
import traceback

from app.config import settings
from app.db import get_pool
from graph.workflows.summarize import run_summarize_workflow
from graph.workflows.triage import run_triage_workflow
from graph.workflows.agent import run_agent_workflow

logger = logging.getLogger(__name__)

WORKFLOW_HANDLERS = {
    "summarize": run_summarize_workflow,
    "triage": run_triage_workflow,
    "agent": run_agent_workflow,
}

# Tasks running longer than this (with no heartbeat update) are considered stale
STALE_TASK_TIMEOUT_MINUTES = 10


async def _reclaim_stale_tasks() -> None:
    """Reset tasks stuck in 'running' with no recent heartbeat back to 'failed'."""
    try:
        pool = get_pool()
        count = await pool.fetchval("""
            UPDATE agent_tasks
            SET status = 'failed',
                error = 'Worker timeout: task exceeded heartbeat deadline',
                completed_at = now(),
                updated_at = now()
            WHERE status = 'running'
              AND heartbeat_at < now() - interval '%s minutes'
            RETURNING count(*)
        """ % STALE_TASK_TIMEOUT_MINUTES)
        if count and count > 0:
            logger.warning("Reclaimed %d stale running tasks", count)
    except Exception as e:
        logger.error("Stale task reclaim error: %s", e)


async def _claim_and_run_one() -> bool:
    """Try to claim and execute one pending task. Returns True if a task was processed."""
    pool = get_pool()

    row = await pool.fetchrow("""
        UPDATE agent_tasks
        SET status = 'running',
            started_at = now(),
            heartbeat_at = now(),
            updated_at = now()
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
        return False

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
        return True

    try:
        # Run workflow with periodic heartbeat updates
        async def heartbeat_loop() -> None:
            while True:
                await asyncio.sleep(30)
                await pool.execute(
                    "UPDATE agent_tasks SET heartbeat_at = now() WHERE id = $1",
                    task_id,
                )

        heartbeat_task = asyncio.create_task(heartbeat_loop())
        try:
            result = await handler(
                task_id=str(task_id),
                node_id=str(node_id) if node_id else None,
                owner_id=str(owner_id),
                task_input=dict(task_input) if task_input else {},
            )
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

        if result and result.get("error"):
            await pool.execute("""
                UPDATE agent_tasks
                SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
                WHERE id = $1
            """, task_id, result["error"])
            logger.warning("Task %s failed: %s", task_id, result["error"])
            return True

        await pool.execute("""
            UPDATE agent_tasks
            SET status = 'completed',
                output = $2::jsonb,
                completed_at = now(),
                updated_at = now()
            WHERE id = $1
        """, task_id, json.dumps(result or {}))

        logger.info("Task %s completed", task_id)

    except Exception as e:
        tb = traceback.format_exc()
        logger.error("Task %s failed: %s", task_id, str(e))
        await pool.execute("""
            UPDATE agent_tasks
            SET status = 'failed',
                error = $2,
                completed_at = now(),
                updated_at = now()
            WHERE id = $1
        """, task_id, f"{type(e).__name__}: {str(e)}\n{tb[:2000]}")

    return True


async def poll_agent_tasks() -> None:
    """
    Main loop: LISTEN for new_task notifications, with polling fallback
    for reliability. Also periodically reclaims stale running tasks.
    """
    pool = get_pool()
    logger.info("Task poller started (fallback interval=%ds)", settings.task_poll_interval_seconds)

    # Set up LISTEN on a dedicated connection
    notify_event = asyncio.Event()

    async def _listen_loop() -> None:
        """Dedicated connection that LISTENs for pg_notify('new_task')."""
        conn = await pool.acquire()
        try:
            await conn.add_listener("new_task", lambda *_args: notify_event.set())
            # Keep connection alive
            while True:
                await asyncio.sleep(3600)
        finally:
            await conn.remove_listener("new_task", lambda *_args: None)
            await pool.release(conn)

    listener_task = asyncio.create_task(_listen_loop())

    stale_check_counter = 0

    try:
        while True:
            # Wait for notification or fallback timeout
            try:
                await asyncio.wait_for(
                    notify_event.wait(),
                    timeout=settings.task_poll_interval_seconds,
                )
            except asyncio.TimeoutError:
                pass
            notify_event.clear()

            # Process all available pending tasks
            while await _claim_and_run_one():
                pass

            # Periodically reclaim stale tasks (every ~12 poll cycles)
            stale_check_counter += 1
            if stale_check_counter >= 12:
                stale_check_counter = 0
                await _reclaim_stale_tasks()

    except asyncio.CancelledError:
        logger.info("Task poller shutting down")
        listener_task.cancel()
        try:
            await listener_task
        except asyncio.CancelledError:
            pass
        raise
