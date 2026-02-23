/**
 * Team membership helper + bootstrap logic.
 * Ensures a default team exists and every authenticated user has a membership.
 * Centralizes role checks reused by all team API routes.
 */

import { db } from "@/lib/db";
import { teams, teamMembers } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export type TeamRole = "owner" | "admin" | "member";

export interface TeamMembership {
  teamId: string;
  memberId: string;
  role: TeamRole;
}

/**
 * Get (or bootstrap) team membership for a user.
 * - If no team exists, creates one and assigns the caller as owner.
 * - If the user has no membership, adds them as member.
 * Returns null only on unexpected failure.
 */
export async function ensureTeamMembership(
  userId: string,
): Promise<TeamMembership> {
  // 1. Get or create the default team
  let [team] = await db.select({ id: teams.id }).from(teams).limit(1);

  if (!team) {
    const [created] = await db
      .insert(teams)
      .values({ name: "My Workspace" })
      .returning({ id: teams.id });
    team = created;
  }

  // 2. Get or create membership
  const [membership] = await db
    .select({ id: teamMembers.id, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  if (membership) {
    return {
      teamId: team.id,
      memberId: membership.id,
      role: membership.role,
    };
  }

  // First member becomes owner, others become member
  const [{ total }] = await db
    .select({ total: count() })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, team.id));

  const role: TeamRole = total === 0 ? "owner" : "member";

  const [newMembership] = await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId, role })
    .onConflictDoNothing()
    .returning({ id: teamMembers.id, role: teamMembers.role });

  // Handle race condition where onConflictDoNothing returned nothing
  if (!newMembership) {
    const [existing] = await db
      .select({ id: teamMembers.id, role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);
    return {
      teamId: team.id,
      memberId: existing.id,
      role: existing.role,
    };
  }

  return {
    teamId: team.id,
    memberId: newMembership.id,
    role: newMembership.role,
  };
}

export function isAdminOrOwner(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: TeamRole): boolean {
  return role === "owner";
}
