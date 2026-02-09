import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and, isNull, inArray, desc, asc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

const nodeTypes = ["page", "database", "database_row", "image"] as const;

// GET /api/nodes?type=page,database&parentId=null&pinned=true&limit=50
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const rawTypes = url.searchParams.get("type")?.split(",").filter(Boolean);
  const parentId = url.searchParams.get("parentId");
  const pinned = url.searchParams.get("pinned");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 200);
  const orderBy = url.searchParams.get("orderBy") ?? "updated_at";

  // Validate type values
  const types = rawTypes?.filter((t): t is (typeof nodeTypes)[number] =>
    (nodeTypes as readonly string[]).includes(t),
  );

  const conditions = [eq(nodes.ownerId, userId)];
  if (types?.length) conditions.push(inArray(nodes.type, types));
  if (parentId === "null") conditions.push(isNull(nodes.parentId));
  else if (parentId) conditions.push(eq(nodes.parentId, parentId));
  if (pinned === "true") conditions.push(eq(nodes.isPinned, true));

  const order = orderBy === "sort_order"
    ? asc(nodes.sortOrder)
    : desc(nodes.updatedAt);

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
  const [node] = await db
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
    .returning();
  return node;
}, { schema: createNodeSchema });
