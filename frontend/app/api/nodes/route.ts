import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { withActor } from "@/lib/db/with-actor";
import { eq, and, isNull, inArray, desc, asc, ne, sql } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { parsePagination } from "@/lib/api-handler";
import { z } from "zod";
import { assertWriteAccess, resolvePermissions } from "@/lib/permissions";

const nodeTypes = ["page", "database", "database_row", "image"] as const;

// GET /api/nodes?type=page,database&parentId=null&pinned=true&limit=50&shared=true
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const rawTypes = url.searchParams.get("type")?.split(",").filter(Boolean);
  const parentId = url.searchParams.get("parentId");
  const pinned = url.searchParams.get("pinned");
  const shared = url.searchParams.get("shared");
  const { limit } = parsePagination(req, { limit: 100 });
  const orderBy = url.searchParams.get("orderBy") ?? "updated_at";

  const types = rawTypes?.filter((t): t is (typeof nodeTypes)[number] =>
    (nodeTypes as readonly string[]).includes(t),
  );

  const order = orderBy === "sort_order"
    ? asc(nodes.sortOrder)
    : desc(nodes.updatedAt);

  if (shared === "true") {
    const conditions = [
      ne(nodes.ownerId, userId),
      eq(nodes.visibility, "team"),
      isNull(nodes.parentId),
      sql`EXISTS (
        SELECT 1 FROM team_members tm1
        JOIN team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = ${userId}
          AND tm2.user_id = ${nodes.ownerId}
      )`,
    ];
    if (types?.length) conditions.push(inArray(nodes.type, types));

    const rows = await db
      .select()
      .from(nodes)
      .where(and(...conditions))
      .orderBy(order)
      .limit(limit);

    return rows.map((r) => ({ ...r, accessLevel: "viewer" as const }));
  }

  const conditions = [eq(nodes.ownerId, userId)];
  if (types?.length) conditions.push(inArray(nodes.type, types));
  if (parentId === "null") conditions.push(isNull(nodes.parentId));
  else if (parentId) conditions.push(eq(nodes.parentId, parentId));
  if (pinned === "true") conditions.push(eq(nodes.isPinned, true));

  return db
    .select()
    .from(nodes)
    .where(and(...conditions))
    .orderBy(order)
    .limit(limit);
});

const createNodeSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  type: z.enum(nodeTypes).default("page"),
  title: z.string().default(""),
  icon: z.string().nullable().optional(),
  content: z.array(z.unknown()).default([]),
  properties: z.record(z.unknown()).default({}),
});

// POST /api/nodes
export const POST = h.mutation(async (data, userId) => {
  await assertWriteAccess(userId);
  const [node] = await withActor("human", userId, (tx) =>
    tx
      .insert(nodes)
      .values({
        ownerId: userId,
        parentId: data.parentId ?? null,
        type: data.type,
        title: data.title,
        icon: data.icon ?? null,
        content: data.content,
        properties: data.properties,
      })
      .returning(),
  );
  return node;
}, { schema: createNodeSchema });
