import * as h from "@/lib/api-handler";
import { db } from "@/lib/db";
import { teamMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

export const GET = h.GET(async (userId) => {
  const membership = await ensureTeamMembership(userId);

  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      createdAt: teamMembers.createdAt,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, membership.teamId));

  return members;
});

const inviteSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
});

export const POST = h.mutation(
  async (data, userId) => {
    const membership = await ensureTeamMembership(userId);
    if (!isAdminOrOwner(membership.role)) {
      throw new Error("Forbidden");
    }

    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!targetUser) {
      throw new Error("User not found — they must sign up first");
    }

    const [existing] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, membership.teamId),
          eq(teamMembers.userId, targetUser.id),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error("User is already a team member");
    }

    const [created] = await db
      .insert(teamMembers)
      .values({
        teamId: membership.teamId,
        userId: targetUser.id,
        role: "member",
      })
      .returning();

    return created;
  },
  { schema: inviteSchema },
);
