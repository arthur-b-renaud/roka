import * as h from "@/lib/api-handler";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannels, chatChannelMembers, teamMembers, users } from "@/lib/db/schema";
import { ensureTeamMembership } from "@/lib/team";
import { ensureGeneralChannel } from "@/lib/chat";

export const GET = h.GET(async (userId) => {
  const membership = await ensureTeamMembership(userId);
  await ensureGeneralChannel(membership.teamId);

  const memberships = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannelMembers.userId, userId),
        eq(chatChannels.teamId, membership.teamId),
      ),
    );

  const channelIds = memberships.map((m) => m.channelId);
  if (channelIds.length === 0) {
    return { channels: [], directs: [] };
  }

  const rows = await db
    .select({
      id: chatChannels.id,
      kind: chatChannels.kind,
      name: chatChannels.name,
      createdAt: chatChannels.createdAt,
      updatedAt: chatChannels.updatedAt,
      memberUserId: chatChannelMembers.userId,
      memberName: users.name,
      memberEmail: users.email,
    })
    .from(chatChannels)
    .innerJoin(chatChannelMembers, eq(chatChannelMembers.channelId, chatChannels.id))
    .innerJoin(users, eq(users.id, chatChannelMembers.userId))
    .where(and(eq(chatChannels.teamId, membership.teamId), inArray(chatChannels.id, channelIds)))
    .orderBy(asc(chatChannels.kind), asc(chatChannels.name));

  const currentUserId = userId;
  const channelsMap = new Map<string, {
    id: string;
    kind: "channel" | "direct";
    name: string;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{ userId: string; name: string | null; email: string }>;
  }>();

  for (const row of rows) {
    const existing = channelsMap.get(row.id);
    if (existing) {
      existing.members.push({
        userId: row.memberUserId,
        name: row.memberName,
        email: row.memberEmail,
      });
      continue;
    }
    channelsMap.set(row.id, {
      id: row.id,
      kind: row.kind,
      name: row.name ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      members: [
        {
          userId: row.memberUserId,
          name: row.memberName,
          email: row.memberEmail,
        },
      ],
    });
  }

  const channels: Array<Record<string, unknown>> = [];
  const directs: Array<Record<string, unknown>> = [];

  for (const c of Array.from(channelsMap.values())) {
    if (c.kind === "channel") {
      channels.push({
        id: c.id,
        kind: c.kind,
        name: c.name,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });
      continue;
    }

    const other = c.members.find((m: { userId: string }) => m.userId !== currentUserId);
    const dmName = other ? (other.name || other.email.split("@")[0]) : "Direct message";
    directs.push({
      id: c.id,
      kind: c.kind,
      name: dmName,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  }

  return { channels, directs };
});

const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const POST = h.mutation(async (data, userId) => {
  const membership = await ensureTeamMembership(userId);
  const trimmed = data.name.trim().toLowerCase().replace(/\s+/g, "-");
  if (!trimmed) {
    throw new Error("Invalid channel name");
  }

  const [created] = await db
    .insert(chatChannels)
    .values({
      teamId: membership.teamId,
      kind: "channel",
      name: trimmed,
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

  if (!created) {
    throw new Error("Channel already exists");
  }

  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, membership.teamId));

  if (members.length > 0) {
    await db.insert(chatChannelMembers).values(
      members.map((m) => ({
        channelId: created.id,
        userId: m.userId,
      })),
    ).onConflictDoNothing();
  }

  return created;
}, { schema: createChannelSchema });
