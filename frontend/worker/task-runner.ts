/**
 * Task runner: claims pending agent_tasks, runs workflows, handles heartbeat
 * and stale task reclamation. Mirrors backend/app/services/task_runner.py.
 */

import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./logger";

const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_TASK_TIMEOUT_MINUTES = 10;
const STALE_CHECK_INTERVAL_MS = 60_000;

export type WorkflowHandler = (
  taskId: string,
  nodeId: string | null,
  ownerId: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

interface ClaimedTask {
  id: string;
  workflow: string;
  input: Record<string, unknown>;
  nodeId: string | null;
  ownerId: string;
  conversationId: string | null;
  memberId: string | null;
}

let handlers: Record<string, WorkflowHandler> = {};
let allowedWorkflows: Set<string> | null = null;

export function registerHandler(workflow: string, handler: WorkflowHandler) {
  handlers[workflow] = handler;
}

export function setAllowedWorkflows(workflows: string[] | null) {
  allowedWorkflows = workflows ? new Set(workflows) : null;
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

async function claimOne(): Promise<ClaimedTask | null> {
  const db = getDb();

  const workflowFilter = allowedWorkflows
    ? sql`AND workflow = ANY(${Array.from(allowedWorkflows)}::workflow_type[])`
    : sql``;

  const rows = await db.execute(sql`
    UPDATE agent_tasks
    SET status = 'running',
        started_at = now(),
        heartbeat_at = now(),
        updated_at = now()
    WHERE id = (
      SELECT id FROM agent_tasks
      WHERE status = 'pending' ${workflowFilter}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, workflow, input, node_id AS "nodeId",
              owner_id AS "ownerId", conversation_id AS "conversationId",
              member_id AS "memberId"
  `);

  if (!rows[0]) return null;
  const r = rows[0] as unknown as ClaimedTask;
  return {
    id: r.id,
    workflow: r.workflow,
    input: (typeof r.input === "string" ? JSON.parse(r.input) : r.input) as Record<string, unknown>,
    nodeId: r.nodeId,
    ownerId: r.ownerId,
    conversationId: r.conversationId,
    memberId: r.memberId,
  };
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

function startHeartbeat(taskId: string): NodeJS.Timeout {
  const db = getDb();
  return setInterval(async () => {
    try {
      await db.execute(sql`
        UPDATE agent_tasks SET heartbeat_at = now() WHERE id = ${taskId}::uuid
      `);
    } catch (e) {
      logger.warn(`Heartbeat failed for task ${taskId}:`, e);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Complete / Fail
// ---------------------------------------------------------------------------

async function completeTask(taskId: string, output: Record<string, unknown>) {
  const db = getDb();
  await db.execute(sql`
    UPDATE agent_tasks
    SET status = 'completed',
        output = ${JSON.stringify(output)}::jsonb,
        completed_at = now(),
        updated_at = now()
    WHERE id = ${taskId}::uuid
  `);
}

async function failTask(taskId: string, error: string) {
  const db = getDb();
  await db.execute(sql`
    UPDATE agent_tasks
    SET status = 'failed',
        error = ${error},
        completed_at = now(),
        updated_at = now()
    WHERE id = ${taskId}::uuid
  `);
}

// ---------------------------------------------------------------------------
// Stale reclaim
// ---------------------------------------------------------------------------

export async function reclaimStaleTasks() {
  const db = getDb();
  const rows = await db.execute(sql`
    UPDATE agent_tasks
    SET status = 'failed',
        error = 'Worker timeout: task exceeded heartbeat deadline',
        completed_at = now(),
        updated_at = now()
    WHERE status = 'running'
      AND heartbeat_at < now() - make_interval(mins => ${STALE_TASK_TIMEOUT_MINUTES})
    RETURNING id
  `);
  const count = (rows as unknown[]).length;
  if (count > 0) {
    logger.info(`Reclaimed ${count} stale task(s)`);
  }
}

// ---------------------------------------------------------------------------
// Run one task
// ---------------------------------------------------------------------------

async function runTask(task: ClaimedTask) {
  const handler = handlers[task.workflow];
  if (!handler) {
    await failTask(task.id, `Unknown workflow: ${task.workflow}`);
    return;
  }

  const hb = startHeartbeat(task.id);
  try {
    // Inject conversation_id / member_id / channel_id into input
    const input = { ...task.input };
    if (task.conversationId) input.conversation_id = task.conversationId;
    if (task.memberId) input.member_id = task.memberId;
    if (task.nodeId) input.node_id = task.nodeId;

    const output = await handler(task.id, task.nodeId, task.ownerId, input);

    if (output.error) {
      await failTask(task.id, String(output.error));
    } else {
      await completeTask(task.id, output);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Task ${task.id} (${task.workflow}) failed:`, msg);
    await failTask(task.id, msg);
  } finally {
    clearInterval(hb);
  }
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let running = true;

export function stopTaskRunner() {
  running = false;
}

export interface WakeRef {
  current: Promise<void>;
}

/**
 * Main poll loop: wait for LISTEN notification or fallback timeout,
 * then drain all pending tasks. WakeRef allows the LISTEN callback to
 * resolve the current promise and create the next one for future wakes.
 */
export async function pollLoop(wakeRef: WakeRef) {
  while (running) {
    await Promise.race([
      wakeRef.current,
      new Promise<void>((r) => setTimeout(r, 5_000)),
    ]);

    let claimed = true;
    while (claimed && running) {
      const task = await claimOne();
      if (task) {
        logger.info(`Running task ${task.id} [${task.workflow}]`);
        await runTask(task);
      } else {
        claimed = false;
      }
    }
  }
}

/**
 * Periodic stale-task reclaim loop.
 */
export async function staleReclaimLoop() {
  while (running) {
    await new Promise<void>((r) => setTimeout(r, STALE_CHECK_INTERVAL_MS));
    if (!running) break;
    try {
      await reclaimStaleTasks();
    } catch (e) {
      logger.warn("Stale reclaim error:", e);
    }
  }
}
