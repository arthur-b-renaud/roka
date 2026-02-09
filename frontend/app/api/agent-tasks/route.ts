import { db } from "@/lib/db";
import { agentTasks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/agent-tasks?limit=10
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);

  return db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.ownerId, userId))
    .orderBy(desc(agentTasks.createdAt))
    .limit(limit);
});

const createTaskSchema = z.object({
  workflow: z.enum(["summarize", "triage", "agent", "custom"]),
  nodeId: z.string().uuid().nullable().optional(),
  input: z.record(z.unknown()).default({}),
  conversationId: z.string().uuid().nullable().optional(),
  agentDefinitionId: z.string().uuid().nullable().optional(),
});

// POST /api/agent-tasks
export const POST = h.mutation(async (data, userId) => {
  const input = { ...data.input };
  if (data.nodeId) input.node_id = data.nodeId;

  const [task] = await db
    .insert(agentTasks)
    .values({
      ownerId: userId,
      workflow: data.workflow,
      nodeId: data.nodeId ?? null,
      conversationId: data.conversationId ?? null,
      agentDefinitionId: data.agentDefinitionId ?? null,
      input,
    })
    .returning();
  return task;
}, { schema: createTaskSchema });
