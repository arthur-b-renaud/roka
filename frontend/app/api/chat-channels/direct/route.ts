import * as h from "@/lib/api-handler";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannels, chatChannelMembers, teamMembers } from "@/lib/db/schema";
import { ensureTeamMembership } from "@/lib/team";
import { buildDirectMessageKey } from "@/lib/chat";

const createDirectSchema = z.object({
  otherUserId: z.string().uuid(),
});

export const POST = h.mutation(async (data, userId) => {
  const membership = await ensureTeamMembership(userId);
  if (data.otherUserId === userId) {
    throw new Error("Invalid direct message user");
  }

  const [otherMembership] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, membership.teamId),
        eq(teamMembers.userId, data.otherUserId),
      ),
    )
    .limit(1);

  if (!otherMembership) {
    throw new Error("User not found");
  }

  const dmKey = buildDirectMessageKey(userId, data.otherUserId);

  const [existing] = await db
    .select({
      id: chatChannels.id,
      kind: chatChannels.kind,
      name: chatChannels.name,
      createdAt: chatChannels.createdAt,
      updatedAt: chatChannels.updatedAt,
    })
    .from(chatChannels)
    .where(and(eq(chatChannels.teamId, membership.teamId), eq(chatChannels.dmKey, dmKey)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(chatChannels)
    .values({
      teamId: membership.teamId,
      kind: "direct",
      dmKey,
      createdBy: userId,
    })
    .onConflictDoNothing()
    .returning({
      id: chatChannels.id,
      kind: chatChannels.kind,
      name: chatChannels.name,
      createdAt: chatChannels.createdAt,
      updatedAt: chatChannels.updatedAt,
    });

  const channel = created ?? (await db
    .select({
      id: chatChannels.id,
      kind: chatChannels.kind,
      name: chatChannels.name,
      createdAt: chatChannels.createdAt,
      updatedAt: chatChannels.updatedAt,
    })
    .from(chatChannels)
    .where(and(eq(chatChannels.teamId, membership.teamId), eq(chatChannels.dmKey, dmKey)))
    .limit(1))[0];

  if (!channel) {
    throw new Error("Failed to create direct conversation");
  }

  await db.insert(chatChannelMembers).values([
    { channelId: channel.id, userId },
    { channelId: channel.id, userId: data.otherUserId },
  ]).onConflictDoNothing();

  return channel;
}, { schema: createDirectSchema });
