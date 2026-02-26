import * as h from "@/lib/api-handler";
import { uuidParamSchema } from "@/lib/api-handler";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannelMembers, teamMembers } from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";

// Agents in a channel are now AI team members added via chat_channel_members.
// This route provides a filtered view of AI members only.

export const GET = h.GET(async (userId, _req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const rows = await db
    .select({
      id: chatChannelMembers.id,
      memberId: chatChannelMembers.memberId,
      displayName: teamMembers.displayName,
      description: teamMembers.description,
      createdAt: chatChannelMembers.createdAt,
    })
    .from(chatChannelMembers)
    .innerJoin(teamMembers, and(
      eq(teamMembers.id, chatChannelMembers.memberId),
      eq(teamMembers.kind, "ai"),
    ))
    .where(eq(chatChannelMembers.channelId, channelId));

  return rows;
});

const addAgentSchema = z.object({
  memberId: z.string().uuid("Invalid member id"),
});

export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const [aiMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, data.memberId), eq(teamMembers.kind, "ai")))
    .limit(1);

  if (!aiMember) {
    throw new Error("AI member not found");
  }

  const [created] = await db
    .insert(chatChannelMembers)
    .values({
      channelId,
      memberId: data.memberId,
    })
    .onConflictDoNothing()
    .returning({
      id: chatChannelMembers.id,
      memberId: chatChannelMembers.memberId,
    });

  if (!created) {
    throw new Error("Agent already added to this channel");
  }

  return created;
}, { schema: addAgentSchema });

const removeAgentSchema = z.object({
  memberId: z.string().uuid("Invalid member id"),
});

export const DELETE = h.mutation(async (data, userId, _req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const [removed] = await db
    .delete(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.memberId, data.memberId),
      ),
    )
    .returning({ id: chatChannelMembers.id });

  if (!removed) {
    throw new Error("Agent not found in this channel");
  }

  return removed;
}, { schema: removeAgentSchema });
