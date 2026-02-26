import * as h from "@/lib/api-handler";
import { uuidParamSchema, parsePagination } from "@/lib/api-handler";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  agentTasks,
  chatChannelMembers,
  chatChannelMessages,
  teamMembers,
} from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";

export const GET = h.GET(async (userId, req, ctx) => {
  const params = uuidParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  const { limit, cursor } = parsePagination(req, { limit: 100 });

  const conditions = [eq(chatChannelMessages.channelId, channelId)];
  if (cursor) {
    conditions.push(lt(chatChannelMessages.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: chatChannelMessages.id,
      channelId: chatChannelMessages.channelId,
      content: chatChannelMessages.content,
      authorMemberId: chatChannelMessages.authorMemberId,
      createdAt: chatChannelMessages.createdAt,
      authorName: teamMembers.displayName,
      authorKind: teamMembers.kind,
      authorAvatarUrl: teamMembers.avatarUrl,
    })
    .from(chatChannelMessages)
    .leftJoin(teamMembers, eq(teamMembers.id, chatChannelMessages.authorMemberId))
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
  const params = uuidParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);

  // Resolve the human member for this user
  const [humanMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  const [msg] = await db
    .insert(chatChannelMessages)
    .values({
      channelId,
      content: data.content,
      authorMemberId: humanMember?.id ?? null,
    })
    .returning();

  // Trigger AI members linked to this channel
  const aiMembers = await db
    .select({
      memberId: chatChannelMembers.memberId,
      isActive: teamMembers.isActive,
    })
    .from(chatChannelMembers)
    .innerJoin(teamMembers, and(
      eq(teamMembers.id, chatChannelMembers.memberId),
      eq(teamMembers.kind, "ai"),
      eq(teamMembers.isActive, true),
    ))
    .where(eq(chatChannelMembers.channelId, channelId));

  for (const ai of aiMembers) {
    if (!ai.memberId) continue;
    await db.insert(agentTasks).values({
      ownerId: userId,
      workflow: "agent",
      status: "pending",
      memberId: ai.memberId,
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
