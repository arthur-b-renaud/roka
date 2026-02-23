import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { withActor } from "@/lib/db/with-actor";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/nodes/:id
export const GET = h.GET(async (userId, _req, ctx) => {
  const { id } = ctx.params;

  const [node] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .limit(1);

  if (!node) throw new Error("Node not found");
  return node;
});

const updateNodeSchema = z.object({
  title: z.string().optional(),
  icon: z.string().nullable().optional(),
  content: z.array(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
  parentId: z.string().uuid().nullable().optional(),
  type: z.enum(["page", "database", "database_row", "image"]).optional(),
  isPinned: z.boolean().optional(),
  searchText: z.string().optional(),
  coverUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// PATCH /api/nodes/:id
export const PATCH = h.mutation(async (data, userId, _req, ctx) => {
  const { id } = ctx.params;

  const update: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) update[key] = val;
  }

  const [updated] = await withActor("human", userId, (tx) =>
    tx
      .update(nodes)
      .set(update)
      .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
      .returning(),
  );

  if (!updated) throw new Error("Node not found");
  return updated;
}, { schema: updateNodeSchema });

// DELETE /api/nodes/:id
export const DELETE = h.mutation(async (_data, userId, _req, ctx) => {
  const { id } = ctx.params;

  await withActor("human", userId, (tx) =>
    tx.delete(nodes).where(and(eq(nodes.id, id), eq(nodes.ownerId, userId))),
  );
  return { ok: true };
});
