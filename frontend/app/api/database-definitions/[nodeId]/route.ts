import { db } from "@/lib/db";
import { databaseDefinitions, nodes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/database-definitions/:nodeId
export const GET = h.GET(async (userId, _req, ctx) => {
  const { nodeId } = ctx.params;

  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  const [def] = await db.select().from(databaseDefinitions)
    .where(eq(databaseDefinitions.nodeId, nodeId)).limit(1);
  return def ?? null;
});

const updateSchema = z.object({
  schemaConfig: z.array(z.unknown()),
});

// PATCH /api/database-definitions/:nodeId
export const PATCH = h.mutation(async (data, userId, _req, ctx) => {
  const { nodeId } = ctx.params;

  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  const [updated] = await db
    .update(databaseDefinitions)
    .set({ schemaConfig: data.schemaConfig })
    .where(eq(databaseDefinitions.nodeId, nodeId))
    .returning();

  return updated;
}, { schema: updateSchema });

const createSchema = z.object({
  nodeId: z.string().uuid(),
  schemaConfig: z.array(z.unknown()).default([]),
});

// POST /api/database-definitions/:nodeId
export const POST = h.mutation(async (data, userId, _req, ctx) => {
  const { nodeId } = ctx.params;

  const [node] = await db.select({ id: nodes.id }).from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.ownerId, userId))).limit(1);
  if (!node) throw new Error("Not found");

  const [def] = await db
    .insert(databaseDefinitions)
    .values({ nodeId, schemaConfig: data.schemaConfig })
    .returning();
  return def;
}, { schema: createSchema });
