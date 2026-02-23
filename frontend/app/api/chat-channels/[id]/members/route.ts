import * as h from "@/lib/api-handler";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannels, chatChannelMembers, teamMembers, users } from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

const channelIdParamSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});

const memberInputSchema = z.object({
  userId: z.string().uuid("Invalid user id"),
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
      id: chatChannelMembers.id,
      userId: chatChannelMembers.userId,
      name: users.name,
      email: users.email,
      image: users.image,
      role: teamMembers.role,
    })
    .from(chatChannelMembers)
    .innerJoin(users, eq(users.id, chatChannelMembers.userId))
    .innerJoin(teamMembers, eq(teamMembers.userId, chatChannelMembers.userId))
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(teamMembers.teamId, chatChannels.teamId),
      ),
    );

  return rows;
});

export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);
  const membership = await ensureTeamMembership(userId);

  const [channel] = await db
    .select({
      id: chatChannels.id,
      teamId: chatChannels.teamId,
      kind: chatChannels.kind,
      createdBy: chatChannels.createdBy,
    })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) {
    throw new Error("Channel not found");
  }
  if (channel.kind !== "channel") {
    throw new Error("Cannot manage members in direct conversations");
  }
  if (!isAdminOrOwner(membership.role) && channel.createdBy !== userId) {
    throw new Error("Forbidden");
  }

  const targetUserId = data.userId;
  const [targetInTeam] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, channel.teamId), eq(teamMembers.userId, targetUserId)))
    .limit(1);

  if (!targetInTeam) {
    throw new Error("User not found");
  }

  const [created] = await db
    .insert(chatChannelMembers)
    .values({
      channelId,
      userId: targetUserId,
    })
    .onConflictDoNothing()
    .returning({
      id: chatChannelMembers.id,
      userId: chatChannelMembers.userId,
    });

  if (!created) {
    throw new Error("User already in channel");
  }

  return created;
}, { schema: memberInputSchema });

export const DELETE = h.mutation(async (data, userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);
  const membership = await ensureTeamMembership(userId);

  const [channel] = await db
    .select({
      id: chatChannels.id,
      kind: chatChannels.kind,
      createdBy: chatChannels.createdBy,
    })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) {
    throw new Error("Channel not found");
  }
  if (channel.kind !== "channel") {
    throw new Error("Cannot manage members in direct conversations");
  }
  if (!isAdminOrOwner(membership.role) && channel.createdBy !== userId) {
    throw new Error("Forbidden");
  }

  const targetUserId = data.userId;
  if (targetUserId === userId) {
    throw new Error("Cannot remove yourself from this channel");
  }

  const [removed] = await db
    .delete(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.userId, targetUserId),
      ),
    )
    .returning({
      id: chatChannelMembers.id,
      userId: chatChannelMembers.userId,
    });

  if (!removed) {
    throw new Error("User not found");
  }

  return removed;
}, { schema: memberInputSchema });
