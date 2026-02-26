import { db } from "@/lib/db";
import { messages, agentTasks, conversations } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

const conversationIdParamSchema = z.object({
  id: z.string().uuid("Invalid conversation id"),
});

// GET /api/conversations/[id]/messages
export const GET = h.GET(async (userId, _req, ctx) => {
  const parsedParams = conversationIdParamSchema.safeParse(ctx.params);
  if (!parsedParams.success) {
    throw new Error(parsedParams.error.issues[0]?.message ?? "Invalid conversation id");
  }
  const conversationId = parsedParams.data.id;

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.ownerId, userId)));

  if (!conv) {
    throw new Error("Conversation not found");
  }

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
});

const sendMessageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty"),
  memberId: z.string().uuid().nullable().optional(),
  nodeId: z.string().uuid().nullable().optional(),
  minimalMode: z.boolean().optional(),
});

// POST /api/conversations/[id]/messages
export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const parsedParams = conversationIdParamSchema.safeParse(ctx.params);
  if (!parsedParams.success) {
    throw new Error(parsedParams.error.issues[0]?.message ?? "Invalid conversation id");
  }
  const conversationId = parsedParams.data.id;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.ownerId, userId)));

  if (!conv) {
    throw new Error("Conversation not found");
  }

  const [task] = await db
    .insert(agentTasks)
    .values({
      ownerId: userId,
      workflow: "agent",
      nodeId: data.nodeId ?? null,
      conversationId,
      memberId: data.memberId ?? conv.memberId ?? null,
      input: {
        prompt: data.content,
        ...(data.nodeId ? { node_id: data.nodeId } : {}),
        ...(data.minimalMode ? { minimal_mode: true } : {}),
      },
    })
    .returning();

  return task;
}, { schema: sendMessageSchema });
