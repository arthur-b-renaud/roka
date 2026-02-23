import * as h from "@/lib/api-handler";
import { db } from "@/lib/db";
import { teamMessages, users } from "@/lib/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";
import { z } from "zod";
import { ensureTeamMembership } from "@/lib/team";

export const GET = h.GET(async (userId, req) => {
  const membership = await ensureTeamMembership(userId);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");

  const conditions = [eq(teamMessages.teamId, membership.teamId)];
  if (cursor) {
    conditions.push(lt(teamMessages.createdAt, new Date(cursor)));
  }

  const rows = await db
    .select({
      id: teamMessages.id,
      teamId: teamMessages.teamId,
      userId: teamMessages.userId,
      content: teamMessages.content,
      createdAt: teamMessages.createdAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(teamMessages)
    .innerJoin(users, eq(teamMessages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(teamMessages.createdAt))
    .limit(limit);

  return rows.reverse();
});

const sendSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const POST = h.mutation(
  async (data, userId) => {
    const membership = await ensureTeamMembership(userId);

    const [msg] = await db
      .insert(teamMessages)
      .values({
        teamId: membership.teamId,
        userId,
        content: data.content,
      })
      .returning();

    return msg;
  },
  { schema: sendSchema },
);
