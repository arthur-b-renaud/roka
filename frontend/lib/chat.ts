import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatChannels, chatChannelMembers, teamMembers } from "@/lib/db/schema";

export function buildDirectMessageKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

export async function ensureGeneralChannel(teamId: string): Promise<string> {
  const [existing] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(
      and(
        eq(chatChannels.teamId, teamId),
        eq(chatChannels.kind, "channel"),
        sql`lower(${chatChannels.name}) = 'general'`,
      ),
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(chatChannels)
    .values({
      teamId,
      kind: "channel",
      name: "general",
    })
    .onConflictDoNothing()
    .returning({ id: chatChannels.id });

  const channelId = created?.id;
  if (channelId) {
    const members = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    if (members.length > 0) {
      await db.insert(chatChannelMembers).values(
        members.map((m) => ({
          channelId,
          userId: m.userId,
        })),
      ).onConflictDoNothing();
    }
    return channelId;
  }

  const [fresh] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(
      and(
        eq(chatChannels.teamId, teamId),
        eq(chatChannels.kind, "channel"),
        sql`lower(${chatChannels.name}) = 'general'`,
      ),
    )
    .limit(1);

  if (!fresh) {
    throw new Error("Failed to ensure general channel");
  }
  return fresh.id;
}

export async function assertChannelMembership(channelId: string, userId: string): Promise<void> {
  const [membership] = await db
    .select({ id: chatChannelMembers.id })
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw new Error("Channel not found");
  }
}
