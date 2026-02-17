import { db } from "@/lib/db";
import { agentTasks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";

// GET /api/executions?limit=50
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const rows = await db
    .select({
      id: agentTasks.id,
      workflow: agentTasks.workflow,
      status: agentTasks.status,
      input: agentTasks.input,
      output: agentTasks.output,
      error: agentTasks.error,
      traceLog: agentTasks.traceLog,
      agentDefinitionId: agentTasks.agentDefinitionId,
      startedAt: agentTasks.startedAt,
      completedAt: agentTasks.completedAt,
      createdAt: agentTasks.createdAt,
    })
    .from(agentTasks)
    .where(eq(agentTasks.ownerId, userId))
    .orderBy(desc(agentTasks.createdAt))
    .limit(limit);

  return rows;
});
