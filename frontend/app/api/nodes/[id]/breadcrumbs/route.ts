import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as h from "@/lib/api-handler";

/**
 * GET /api/nodes/:id/breadcrumbs — ancestor path (root → node) in one query.
 * Replaces N sequential node fetches with a single recursive CTE.
 */
export const GET = h.GET(async (userId, _req, ctx) => {
  const { id } = ctx.params;

  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, title, icon, 1 AS depth
      FROM nodes
      WHERE id = ${id}::uuid AND owner_id = ${userId}::uuid
      UNION ALL
      SELECT n.id, n.parent_id, n.title, n.icon, a.depth + 1
      FROM nodes n
      INNER JOIN ancestors a ON n.id = a.parent_id
      WHERE a.depth < 10
    )
    SELECT id, title, icon
    FROM ancestors
    ORDER BY depth DESC
  `);

  type Row = { id: string; title: string | null; icon: string | null };
  const raw = (result as unknown) as Row[] | { rows?: Row[] };
  const rows: Row[] = Array.isArray(raw) ? raw : (raw.rows ?? []);
  const crumbs = rows.map((r) => ({
    id: r.id,
    title: r.title || "Untitled",
    icon: r.icon ?? null,
  }));

  return crumbs;
});
