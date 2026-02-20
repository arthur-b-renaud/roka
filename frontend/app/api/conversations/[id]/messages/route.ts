import { db } from "@/lib/db";
import { messages, agentTasks, conversations } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/conversations/[id]/messages -- list messages for a conversation
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const conversationId = url.pathname.split("/conversations/")[1].split("/messages")[0];

  // Verify ownership
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
  agentDefinitionId: z.string().uuid().nullable().optional(),
  nodeId: z.string().uuid().nullable().optional(),
  minimalMode: z.boolean().optional(),
});

// POST /api/conversations/[id]/messages -- send message (creates agent task)
export const POST = h.mutation(async (data, userId, req) => {
  const url = new URL(req.url);
  const conversationId = url.pathname.split("/conversations/")[1].split("/messages")[0];

  // Verify ownership
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.ownerId, userId)));

  if (!conv) {
    throw new Error("Conversation not found");
  }

  // Create agent task linked to conversation
  const [task] = await db
    .insert(agentTasks)
    .values({
      ownerId: userId,
      workflow: "agent",
      nodeId: data.nodeId ?? null,
      conversationId,
      agentDefinitionId: data.agentDefinitionId ?? conv.agentDefinitionId ?? null,
      input: {
        prompt: data.content,
        ...(data.nodeId ? { node_id: data.nodeId } : {}),
        ...(data.minimalMode ? { minimal_mode: true } : {}),
      },
    })
    .returning();

  return task;
}, { schema: sendMessageSchema });
