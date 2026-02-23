import * as h from "@/lib/api-handler";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  ensureTeamMembership,
  isAdminOrOwner,
  isOwner,
} from "@/lib/team";
import type { RouteContext } from "@/lib/api-handler";

const roleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const PATCH = h.mutation(
  async (data, userId, _req, ctx: RouteContext) => {
    const targetId = ctx.params.id;
    const membership = await ensureTeamMembership(userId);

    if (!isAdminOrOwner(membership.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const [target] = await db
      .select({ id: teamMembers.id, role: teamMembers.role, userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.id, targetId),
          eq(teamMembers.teamId, membership.teamId),
        ),
      )
      .limit(1);

    if (!target) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    if (isOwner(target.role)) {
      return Response.json(
        { error: "Cannot change owner role" },
        { status: 403 },
      );
    }

    // Admin cannot promote to owner (only owner can, and owner isn't in the enum)
    const [updated] = await db
      .update(teamMembers)
      .set({ role: data.role })
      .where(eq(teamMembers.id, targetId))
      .returning();

    return updated;
  },
  { schema: roleSchema },
);

export const DELETE = h.mutation(async (_data, userId, _req, ctx: RouteContext) => {
  const targetId = ctx.params.id;
  const membership = await ensureTeamMembership(userId);

  if (!isAdminOrOwner(membership.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.id, targetId),
        eq(teamMembers.teamId, membership.teamId),
      ),
    )
    .limit(1);

  if (!target) {
    return Response.json({ error: "Member not found" }, { status: 404 });
  }

  if (isOwner(target.role)) {
    return Response.json(
      { error: "Cannot remove the team owner" },
      { status: 403 },
    );
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, targetId));

  return { ok: true };
});
