import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/nodes/:id
export const GET = h.GET(async (userId, req) => {
  const id = req.url.split("/api/nodes/")[1]?.split("?")[0];
  if (!id) throw new Error("Missing node id");

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
}).passthrough();

// PATCH /api/nodes/:id
export const PATCH = h.mutation(async (data, userId, req) => {
  const id = req.url.split("/api/nodes/")[1]?.split("?")[0];
  if (!id) throw new Error("Missing node id");

  // Build update object from provided fields
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.icon !== undefined) update.icon = data.icon;
  if (data.content !== undefined) update.content = data.content;
  if (data.properties !== undefined) update.properties = data.properties;
  if (data.parentId !== undefined) update.parentId = data.parentId;
  if (data.type !== undefined) update.type = data.type;
  if (data.isPinned !== undefined) update.isPinned = data.isPinned;
  if (data.searchText !== undefined) update.searchText = data.searchText;

  const [updated] = await db
    .update(nodes)
    .set(update)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .returning();

  if (!updated) throw new Error("Node not found");
  return updated;
}, { schema: updateNodeSchema });

// DELETE /api/nodes/:id
export const DELETE = h.mutation(async (_data, userId, req) => {
  const id = req.url.split("/api/nodes/")[1]?.split("?")[0];
  if (!id) throw new Error("Missing node id");

  await db.delete(nodes).where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)));
  return { ok: true };
});
