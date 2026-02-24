import * as h from "@/lib/api-handler";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannelAgents, agentDefinitions } from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";

const channelIdParamSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});

const agentInputSchema = z.object({
  agentDefinitionId: z.string().uuid("Invalid agent id"),
});

export const GET = h.GET(async (userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const rows = await db
    .select({
      id: chatChannelAgents.id,
      agentDefinitionId: chatChannelAgents.agentDefinitionId,
      name: agentDefinitions.name,
      description: agentDefinitions.description,
      createdAt: chatChannelAgents.createdAt,
    })
    .from(chatChannelAgents)
    .innerJoin(agentDefinitions, eq(agentDefinitions.id, chatChannelAgents.agentDefinitionId))
    .where(eq(chatChannelAgents.channelId, channelId));

  return rows;
});

export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const [agentDef] = await db
    .select({ id: agentDefinitions.id })
    .from(agentDefinitions)
    .where(eq(agentDefinitions.id, data.agentDefinitionId))
    .limit(1);

  if (!agentDef) {
    throw new Error("Agent not found");
  }

  const [created] = await db
    .insert(chatChannelAgents)
    .values({
      channelId,
      agentDefinitionId: data.agentDefinitionId,
      addedBy: userId,
    })
    .onConflictDoNothing()
    .returning({
      id: chatChannelAgents.id,
      agentDefinitionId: chatChannelAgents.agentDefinitionId,
    });

  if (!created) {
    throw new Error("Agent already added to this channel");
  }

  return created;
}, { schema: agentInputSchema });

export const DELETE = h.mutation(async (data, userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const [removed] = await db
    .delete(chatChannelAgents)
    .where(
      and(
        eq(chatChannelAgents.channelId, channelId),
        eq(chatChannelAgents.agentDefinitionId, data.agentDefinitionId),
      ),
    )
    .returning({ id: chatChannelAgents.id });

  if (!removed) {
    throw new Error("Agent not found in this channel");
  }

  return removed;
}, { schema: agentInputSchema });
