import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as h from "@/lib/api-handler";

const MAX_QUERY_LENGTH = 200;

/** Sanitize input for to_tsquery: strip tsquery operators, keep alphanumeric + spaces. */
function sanitizeTsQuery(raw: string): string {
  return raw.replace(/[&|!<>():*\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build a prefix-aware tsquery string.
 * "hello wor" -> "hello & wor:*"   (exact match on completed words, prefix on last)
 */
function buildPrefixQuery(input: string): string | null {
  const words = sanitizeTsQuery(input).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((w, i) => (i === words.length - 1 ? `${w}:*` : w))
    .join(" & ");
}

// GET /api/search?q=query&limit=20
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  if (!query) return [];

  // 1. Try full-text search with prefix matching on the last word
  const tsq = buildPrefixQuery(query);
  let rows: unknown[] = [];

  if (tsq) {
    const fts = await db.execute(sql`
      SELECT
        n.id,
        n.title,
        n.type,
        n.parent_id AS "parentId",
        ts_headline('english', n.search_text, to_tsquery('english', ${tsq}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') AS snippet,
        ts_rank(to_tsvector('english', n.search_text), to_tsquery('english', ${tsq})) AS rank
      FROM nodes n
      WHERE n.owner_id = ${userId}
        AND to_tsvector('english', n.search_text) @@ to_tsquery('english', ${tsq})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
    rows = (fts as unknown[]);
  }

  // 2. Fallback: trigram similarity search when FTS returns nothing
  if (rows.length === 0) {
    const trgm = await db.execute(sql`
      SELECT
        n.id,
        n.title,
        n.type,
        n.parent_id AS "parentId",
        '' AS snippet,
        similarity(n.search_text, ${query}) AS rank
      FROM nodes n
      WHERE n.owner_id = ${userId}
        AND n.search_text % ${query}
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
    rows = (trgm as unknown[]);
  }

  return rows;
});
