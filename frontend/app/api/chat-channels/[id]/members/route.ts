import * as h from "@/lib/api-handler";
import { uuidParamSchema } from "@/lib/api-handler";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannels, chatChannelMembers, teamMembers, users } from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

const memberInputSchema = z.object({
  memberId: z.string().uuid("Invalid member id"),
});

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
      kind: teamMembers.kind,
      avatarUrl: teamMembers.avatarUrl,
      role: teamMembers.role,
      email: users.email,
      image: users.image,
    })
    .from(chatChannelMembers)
    .innerJoin(teamMembers, eq(teamMembers.id, chatChannelMembers.memberId))
    .leftJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(chatChannelMembers.channelId, channelId));

  return rows;
});

export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
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

  if (!channel) throw new Error("Channel not found");
  if (channel.kind !== "channel") throw new Error("Cannot manage members in direct conversations");
  if (!isAdminOrOwner(membership.role) && channel.createdBy !== userId) {
    throw new Error("Forbidden");
  }

  const [targetMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, channel.teamId), eq(teamMembers.id, data.memberId)))
    .limit(1);

  if (!targetMember) throw new Error("Member not found");

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

  if (!created) throw new Error("Member already in channel");

  return created;
}, { schema: memberInputSchema });

export const DELETE = h.mutation(async (data, userId, _req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
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

  if (!channel) throw new Error("Channel not found");
  if (channel.kind !== "channel") throw new Error("Cannot manage members in direct conversations");
  if (!isAdminOrOwner(membership.role) && channel.createdBy !== userId) {
    throw new Error("Forbidden");
  }

  const [removed] = await db
    .delete(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.memberId, data.memberId),
      ),
    )
    .returning({ id: chatChannelMembers.id });

  if (!removed) throw new Error("Member not found in channel");

  return removed;
}, { schema: memberInputSchema });
