import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

// Compatibility layer: agent definitions are now AI team members.
// GET /api/agent-definitions — returns AI team members
export const GET = h.GET(async (userId) => {
  const membership = await ensureTeamMembership(userId);

  return db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, membership.teamId),
        eq(teamMembers.kind, "ai"),
      ),
    )
    .orderBy(desc(teamMembers.updatedAt));
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  systemPrompt: z.string().default(""),
  model: z.string().default(""),
  toolIds: z.array(z.string().uuid()).default([]),
  trigger: z.enum(["manual", "schedule", "event"]).default("manual"),
  triggerConfig: z.record(z.unknown()).default({}),
});

export const POST = h.mutation(async (data, userId) => {
  const membership = await ensureTeamMembership(userId);

  const [member] = await db
    .insert(teamMembers)
    .values({
      teamId: membership.teamId,
      kind: "ai",
      displayName: data.name,
      description: data.description,
      systemPrompt: data.systemPrompt,
      model: data.model,
      toolIds: data.toolIds,
      trigger: data.trigger,
      triggerConfig: data.triggerConfig,
    })
    .returning();
  return member;
}, { schema: createSchema });

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export const DELETE = h.mutation(async (data, userId) => {
  const membership = await ensureTeamMembership(userId);
  if (!isAdminOrOwner(membership.role)) {
    throw new Error("Forbidden");
  }

  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.id, data.id),
        eq(teamMembers.teamId, membership.teamId),
        eq(teamMembers.kind, "ai"),
      ),
    );
  return { ok: true };
}, { schema: deleteSchema });
