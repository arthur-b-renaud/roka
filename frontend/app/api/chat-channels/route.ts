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
    .innerJoin(teamMembers, eq(teamMembers.id, chatChannelMembers.memberId))
    .where(
      and(
        eq(teamMembers.userId, userId),
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
      memberId: chatChannelMembers.memberId,
      memberDisplayName: teamMembers.displayName,
      memberKind: teamMembers.kind,
      memberUserId: teamMembers.userId,
    })
    .from(chatChannels)
    .innerJoin(chatChannelMembers, eq(chatChannelMembers.channelId, chatChannels.id))
    .innerJoin(teamMembers, eq(teamMembers.id, chatChannelMembers.memberId))
    .where(and(eq(chatChannels.teamId, membership.teamId), inArray(chatChannels.id, channelIds)))
    .orderBy(asc(chatChannels.kind), asc(chatChannels.name));

  const channelsMap = new Map<string, {
    id: string;
    kind: "channel" | "direct";
    name: string;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{ memberId: string | null; displayName: string; kind: string; userId: string | null }>;
  }>();

  for (const row of rows) {
    const existing = channelsMap.get(row.id);
    const memberInfo = {
      memberId: row.memberId,
      displayName: row.memberDisplayName,
      kind: row.memberKind,
      userId: row.memberUserId,
    };
    if (existing) {
      existing.members.push(memberInfo);
      continue;
    }
    channelsMap.set(row.id, {
      id: row.id,
      kind: row.kind,
      name: row.name ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      members: [memberInfo],
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

    const other = c.members.find((m) => m.userId !== userId);
    const dmName = other ? other.displayName : "Direct message";
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

  // Add all human team members to the new channel
  const members = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, membership.teamId), eq(teamMembers.kind, "human")));

  if (members.length > 0) {
    await db.insert(chatChannelMembers).values(
      members.map((m) => ({
        channelId: created.id,
        memberId: m.id,
      })),
    ).onConflictDoNothing();
  }

  return created;
}, { schema: createChannelSchema });
