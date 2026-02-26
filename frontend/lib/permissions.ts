/**
 * Permission enforcement utilities for the unified team member model.
 * Checks page_access (all vs. selected) and can_write for both humans and AI.
 */

import { getMemberPermissions, type MemberPermissions } from "@/lib/api-handler";

/**
 * Resolve and return the caller's member permissions.
 * Returns a permissive default if the user has no membership yet (bootstrap flow).
 */
export async function resolvePermissions(userId: string): Promise<MemberPermissions> {
  const perms = await getMemberPermissions(userId);
  if (!perms) {
    return {
      memberId: "",
      kind: "human",
      pageAccess: "all",
      allowedNodeIds: [],
      canWrite: true,
    };
  }
  return perms;
}

/** Check if a node ID is accessible given the member's permissions. */
export function canAccessNode(perms: MemberPermissions, nodeId: string): boolean {
  if (perms.pageAccess === "all") return true;
  return perms.allowedNodeIds.includes(nodeId);
}

/** Check if the member can write (mutate nodes). */
export function canWriteNodes(perms: MemberPermissions): boolean {
  return perms.canWrite;
}

/**
 * Assert the member has write access. Throws Forbidden if not.
 */
export async function assertWriteAccess(userId: string): Promise<MemberPermissions> {
  const perms = await resolvePermissions(userId);
  if (!perms.canWrite) {
    throw new Error("Forbidden");
  }
  return perms;
}

/**
 * Assert the member can access a specific node. Throws Forbidden if not.
 */
export async function assertNodeAccess(userId: string, nodeId: string): Promise<MemberPermissions> {
  const perms = await resolvePermissions(userId);
  if (!canAccessNode(perms, nodeId)) {
    throw new Error("Forbidden");
  }
  return perms;
}
