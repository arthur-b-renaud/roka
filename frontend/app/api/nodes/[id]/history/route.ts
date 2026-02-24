import { db } from "@/lib/db";
import { nodes, nodeRevisions } from "@/lib/db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import * as h from "@/lib/api-handler";

/**
 * GET /api/nodes/:id/history?limit=50&offset=0&fields=meta|full
 *
 * fields=meta  → timeline listing (no oldData/newData, includes actorDisplayName)
 * fields=full  → full revisions with JSONB payloads (default)
 */
export const GET = h.GET(async (userId, req, ctx) => {
  const { id } = ctx.params;

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
  const fields = url.searchParams.get("fields") ?? "full";

  const [totalResult] = await db
    .select({ total: count() })
    .from(nodeRevisions)
    .where(eq(nodeRevisions.nodeId, id));

  const total = totalResult.total;

  if (fields === "meta") {
    const revisions = await db.execute(sql`
      SELECT
        r.id,
        r.node_id   AS "nodeId",
        r.operation,
        r.changed_fields AS "changedFields",
        r.actor_type     AS "actorType",
        r.actor_id       AS "actorId",
        r.created_at     AS "createdAt",
        r.updated_at     AS "updatedAt",
        CASE
          WHEN r.actor_type = 'human' THEN COALESCE(u.name, u.email, 'User')
          WHEN r.actor_type = 'agent' THEN COALESCE('Agent: ' || at.workflow::text, 'Agent')
          ELSE INITCAP(r.actor_type)
        END AS "actorDisplayName"
      FROM node_revisions r
      LEFT JOIN users u ON r.actor_type = 'human' AND r.actor_id = u.id::text
      LEFT JOIN agent_tasks at ON r.actor_type = 'agent' AND r.actor_id = at.id::text
      WHERE r.node_id = ${id}::uuid
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return { revisions, total };
  }

  // fields=full (default)
  const revisions = await db.execute(sql`
    SELECT
      r.*,
      CASE
        WHEN r.actor_type = 'human' THEN COALESCE(u.name, u.email, 'User')
        WHEN r.actor_type = 'agent' THEN COALESCE('Agent: ' || at.workflow::text, 'Agent')
        ELSE INITCAP(r.actor_type)
      END AS "actorDisplayName"
    FROM node_revisions r
    LEFT JOIN users u ON r.actor_type = 'human' AND r.actor_id = u.id::text
    LEFT JOIN agent_tasks at ON r.actor_type = 'agent' AND r.actor_id = at.id::text
    WHERE r.node_id = ${id}::uuid
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return { revisions, total };
});
