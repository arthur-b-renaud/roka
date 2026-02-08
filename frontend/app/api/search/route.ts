import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import * as h from "@/lib/api-handler";

// GET /api/search?q=query&limit=20
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

  if (!query.trim()) return [];

  // Full-text search using tsvector
  const results = await db.execute(sql`
    SELECT
      n.id,
      n.title,
      n.type,
      n.parent_id,
      ts_headline('english', n.search_text, plainto_tsquery('english', ${query}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') AS snippet,
      ts_rank(to_tsvector('english', n.search_text), plainto_tsquery('english', ${query})) AS rank
    FROM nodes n
    WHERE n.owner_id = ${userId}
      AND to_tsvector('english', n.search_text) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  return results.rows ?? results;
});
