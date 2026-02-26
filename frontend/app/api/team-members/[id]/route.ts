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

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  role: z.enum(["admin", "member"]).optional(),
  pageAccess: z.enum(["all", "selected"]).optional(),
  allowedNodeIds: z.array(z.string().uuid()).optional(),
  canWrite: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  toolIds: z.array(z.string().uuid()).optional(),
  trigger: z.enum(["manual", "schedule", "event"]).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = h.mutation(
  async (data, userId, _req, ctx: RouteContext) => {
    const targetId = ctx.params.id;
    const membership = await ensureTeamMembership(userId);

    if (!isAdminOrOwner(membership.role)) {
      throw new Error("Forbidden");
    }

    const [target] = await db
      .select({ id: teamMembers.id, role: teamMembers.role, kind: teamMembers.kind })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.id, targetId),
          eq(teamMembers.teamId, membership.teamId),
        ),
      )
      .limit(1);

    if (!target) {
      throw new Error("Member not found");
    }

    if (isOwner(target.role) && data.role) {
      throw new Error("Cannot change owner role");
    }

    const [updated] = await db
      .update(teamMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamMembers.id, targetId))
      .returning();

    return updated;
  },
  { schema: updateSchema },
);

export const DELETE = h.mutation(async (_data, userId, _req, ctx: RouteContext) => {
  const targetId = ctx.params.id;
  const membership = await ensureTeamMembership(userId);

  if (!isAdminOrOwner(membership.role)) {
    throw new Error("Forbidden");
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
    throw new Error("Member not found");
  }

  if (isOwner(target.role)) {
    throw new Error("Cannot remove the team owner");
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, targetId));

  return { ok: true };
});
