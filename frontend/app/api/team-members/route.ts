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
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      kind: teamMembers.kind,
      displayName: teamMembers.displayName,
      avatarUrl: teamMembers.avatarUrl,
      description: teamMembers.description,
      role: teamMembers.role,
      pageAccess: teamMembers.pageAccess,
      allowedNodeIds: teamMembers.allowedNodeIds,
      canWrite: teamMembers.canWrite,
      systemPrompt: teamMembers.systemPrompt,
      model: teamMembers.model,
      toolIds: teamMembers.toolIds,
      trigger: teamMembers.trigger,
      triggerConfig: teamMembers.triggerConfig,
      isActive: teamMembers.isActive,
      createdAt: teamMembers.createdAt,
      updatedAt: teamMembers.updatedAt,
      email: users.email,
      image: users.image,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, membership.teamId));

  return members;
});

const createSchema = z.object({
  kind: z.enum(["human", "ai"]),
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
  description: z.string().default(""),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  pageAccess: z.enum(["all", "selected"]).default("all"),
  allowedNodeIds: z.array(z.string().uuid()).default([]),
  canWrite: z.boolean().default(true),
  systemPrompt: z.string().default(""),
  model: z.string().default(""),
  toolIds: z.array(z.string().uuid()).default([]),
  trigger: z.enum(["manual", "schedule", "event"]).default("manual"),
  triggerConfig: z.record(z.unknown()).default({}),
});

export const POST = h.mutation(
  async (data, userId) => {
    const membership = await ensureTeamMembership(userId);
    if (!isAdminOrOwner(membership.role)) {
      throw new Error("Forbidden");
    }

    if (data.kind === "human") {
      if (!data.email) throw new Error("Email is required for human members");

      const [targetUser] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.email, data.email.toLowerCase().trim()))
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
          kind: "human",
          displayName: data.displayName || targetUser.name || data.email.split("@")[0],
          role: data.role,
          pageAccess: data.pageAccess,
          allowedNodeIds: data.allowedNodeIds,
          canWrite: data.canWrite,
        })
        .returning();

      return created;
    }

    // AI member
    if (!data.displayName) throw new Error("Name is required for AI members");

    const [created] = await db
      .insert(teamMembers)
      .values({
        teamId: membership.teamId,
        kind: "ai",
        displayName: data.displayName,
        description: data.description,
        role: data.role,
        pageAccess: data.pageAccess,
        allowedNodeIds: data.allowedNodeIds,
        canWrite: data.canWrite,
        systemPrompt: data.systemPrompt,
        model: data.model,
        toolIds: data.toolIds,
        trigger: data.trigger,
        triggerConfig: data.triggerConfig,
      })
      .returning();

    return created;
  },
  { schema: createSchema },
);
