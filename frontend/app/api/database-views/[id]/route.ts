import { db } from "@/lib/db";
import { databaseViews, nodes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

const updateViewSchema = z.object({
  name: z.string().optional(),
  viewConfig: z.record(z.unknown()).optional(),
});

// PATCH /api/database-views/:id
export const PATCH = h.mutation(async (data, userId, _req, ctx) => {
  const { id } = ctx.params;

  const [view] = await db.select().from(databaseViews).where(eq(databaseViews.id, id)).limit(1);
  if (!view) throw new Error("View not found");

  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, view.databaseId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.viewConfig !== undefined) update.viewConfig = data.viewConfig;

  const [updated] = await db.update(databaseViews).set(update)
    .where(eq(databaseViews.id, id)).returning();
  return updated;
}, { schema: updateViewSchema });

// DELETE /api/database-views/:id
export const DELETE = h.mutation(async (_data, userId, _req, ctx) => {
  const { id } = ctx.params;

  const [view] = await db.select().from(databaseViews).where(eq(databaseViews.id, id)).limit(1);
  if (!view) throw new Error("View not found");

  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, view.databaseId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  await db.delete(databaseViews).where(eq(databaseViews.id, id));
  return { ok: true };
});
