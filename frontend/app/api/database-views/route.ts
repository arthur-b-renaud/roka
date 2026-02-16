import { db } from "@/lib/db";
import { databaseViews, nodes } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/database-views?databaseId=xxx — single query with ownership join
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const databaseId = url.searchParams.get("databaseId");
  if (!databaseId) throw new Error("Missing databaseId");

  return db
    .select({
      id: databaseViews.id,
      databaseId: databaseViews.databaseId,
      name: databaseViews.name,
      viewConfig: databaseViews.viewConfig,
      sortOrder: databaseViews.sortOrder,
      createdAt: databaseViews.createdAt,
      updatedAt: databaseViews.updatedAt,
    })
    .from(databaseViews)
    .innerJoin(nodes, eq(nodes.id, databaseViews.databaseId))
    .where(and(
      eq(databaseViews.databaseId, databaseId),
      eq(nodes.ownerId, userId)
    ))
    .orderBy(asc(databaseViews.sortOrder));
});

const createViewSchema = z.object({
  databaseId: z.string().uuid(),
  name: z.string().default("Default view"),
  viewConfig: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
});

// POST /api/database-views
export const POST = h.mutation(async (data, userId) => {
  // Verify ownership
  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, data.databaseId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  const [view] = await db
    .insert(databaseViews)
    .values({
      databaseId: data.databaseId,
      name: data.name,
      viewConfig: data.viewConfig,
      sortOrder: data.sortOrder,
    })
    .returning();
  return view;
}, { schema: createViewSchema });
