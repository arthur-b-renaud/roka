/**
 * Worker entry point: standalone Node.js process that polls agent_tasks
 * and runs workflows. Shares package.json / Drizzle schema with the frontend.
 *
 * Run: npx tsx worker/index.ts
 */

import { getDb, getListenClient, closeAll } from "./db";
import { registerHandler, setAllowedWorkflows, pollLoop, staleReclaimLoop, stopTaskRunner, type WakeRef } from "./task-runner";
import { startCentrifugoBridge } from "./centrifugo";
import { seedBuiltinTools } from "./seed";
import { logger } from "./logger";

// Lazy-import workflows to avoid circular deps at module load time
async function registerWorkflows() {
  const { runSummarizeWorkflow } = await import("./workflows/summarize");
  const { runTriageWorkflow } = await import("./workflows/triage");
  const { runAgentWorkflow } = await import("./workflows/agent");

  registerHandler("summarize", runSummarizeWorkflow);
  registerHandler("triage", runTriageWorkflow);
  registerHandler("agent", runAgentWorkflow);
  registerHandler("custom", runAgentWorkflow);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  logger.info("Worker starting");

  // Parse optional WORKER_WORKFLOWS env to restrict which workflows this worker claims
  const wfEnv = process.env.WORKER_WORKFLOWS;
  if (wfEnv) {
    const list = wfEnv.split(",").map((s) => s.trim()).filter(Boolean);
    setAllowedWorkflows(list);
    logger.info(`Restricted to workflows: ${list.join(", ")}`);
  }

  const db = getDb();
  const listenClient = getListenClient();

  // Seed built-in tool definitions
  try {
    await seedBuiltinTools(db);
  } catch (e) {
    logger.warn("Seed built-in tools failed (non-fatal):", e);
  }

  // Register workflow handlers
  await registerWorkflows();

  // WakeRef: LISTEN callback resolves current promise and creates next for future wakes
  let resolveWake: () => void;
  const wakeRef: WakeRef = {
    current: new Promise<void>((r) => { resolveWake = r; }),
  };

  await listenClient.listen("new_task", () => {
    resolveWake();
    wakeRef.current = new Promise<void>((r) => { resolveWake = r; });
  });
  logger.info("Listening on channel: new_task");

  await startCentrifugoBridge(async (channel, cb) => {
    await listenClient.listen(channel, cb);
  });

  const pollPromise = pollLoop(wakeRef);
  const stalePromise = staleReclaimLoop();

  logger.info("Worker ready");

  await Promise.all([pollPromise, stalePromise]);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);
  stopTaskRunner();

  // Give in-progress task up to 30s to finish
  await new Promise<void>((r) => setTimeout(r, 2_000));

  await closeAll();
  logger.info("Worker stopped");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((e) => {
  logger.error("Worker crashed:", e);
  process.exit(1);
});
