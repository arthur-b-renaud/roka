import { db } from "@/lib/db";
import { nodes, nodeRevisions } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import * as h from "@/lib/api-handler";

/**
 * GET /api/nodes/:id/history?limit=50&offset=0
 * Returns paginated revision history for a node, newest first.
 */
export const GET = h.GET(async (userId, req, ctx) => {
  const { id } = ctx.params;

  // Verify the user owns the node
  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .limit(1);

  if (!node) throw new Error("Node not found");

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);
  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);

  const [revisions, [{ total }]] = await Promise.all([
    db
      .select()
      .from(nodeRevisions)
      .where(eq(nodeRevisions.nodeId, id))
      .orderBy(desc(nodeRevisions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(nodeRevisions)
      .where(eq(nodeRevisions.nodeId, id)),
  ]);

  return { revisions, total };
});
