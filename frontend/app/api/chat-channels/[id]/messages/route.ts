import * as h from "@/lib/api-handler";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  agentDefinitions,
  agentTasks,
  chatChannelAgents,
  chatChannelMessages,
  users,
} from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";

const channelIdParamSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});

export const GET = h.GET(async (userId, req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 200);
  const cursor = url.searchParams.get("cursor");

  const conditions = [eq(chatChannelMessages.channelId, channelId)];
  if (cursor) {
    conditions.push(lt(chatChannelMessages.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: chatChannelMessages.id,
      channelId: chatChannelMessages.channelId,
      userId: chatChannelMessages.userId,
      content: chatChannelMessages.content,
      agentDefinitionId: chatChannelMessages.agentDefinitionId,
      createdAt: chatChannelMessages.createdAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
      agentName: agentDefinitions.name,
    })
    .from(chatChannelMessages)
    .innerJoin(users, eq(users.id, chatChannelMessages.userId))
    .leftJoin(agentDefinitions, eq(agentDefinitions.id, chatChannelMessages.agentDefinitionId))
    .where(and(...conditions))
    .orderBy(desc(chatChannelMessages.createdAt))
    .limit(limit);

  return rows.reverse();
});

const sendSchema = z.object({
  content: z.string().min(1).max(4000),
  nodeId: z.string().uuid().optional(),
});

export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const [msg] = await db
    .insert(chatChannelMessages)
    .values({
      channelId,
      userId,
      content: data.content,
    })
    .returning();

  // Trigger agents linked to this channel
  const agents = await db
    .select({
      agentDefinitionId: chatChannelAgents.agentDefinitionId,
      ownerId: agentDefinitions.ownerId,
    })
    .from(chatChannelAgents)
    .innerJoin(agentDefinitions, and(
      eq(agentDefinitions.id, chatChannelAgents.agentDefinitionId),
      eq(agentDefinitions.isActive, true),
    ))
    .where(eq(chatChannelAgents.channelId, channelId));

  for (const agent of agents) {
    await db.insert(agentTasks).values({
      ownerId: agent.ownerId,
      workflow: "agent",
      status: "pending",
      agentDefinitionId: agent.agentDefinitionId,
      nodeId: data.nodeId ?? null,
      input: {
        prompt: data.content,
        channel_id: channelId,
        triggering_user_id: userId,
        ...(data.nodeId ? { node_id: data.nodeId } : {}),
      },
    });
  }

  return msg;
}, { schema: sendSchema });
