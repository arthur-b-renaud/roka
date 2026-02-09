import { db } from "@/lib/db";
import { toolDefinitions } from "@/lib/db/schema";
import { eq, or, isNull, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/tool-definitions -- list all active tools (system + user's custom)
export const GET = h.GET(async (userId) => {
  return db
    .select()
    .from(toolDefinitions)
    .where(
      or(
        isNull(toolDefinitions.ownerId),      // system builtins
        eq(toolDefinitions.ownerId, userId),   // user's custom tools
      ),
    )
    .orderBy(desc(toolDefinitions.type), toolDefinitions.name);
});

const createSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().default(""),
  type: z.enum(["http", "custom"]).default("http"),
  config: z.record(z.unknown()).default({}),
  credentialId: z.string().uuid().nullable().optional(),
});

// POST /api/tool-definitions -- create custom tool
export const POST = h.mutation(async (data, userId) => {
  const [tool] = await db
    .insert(toolDefinitions)
    .values({
      ownerId: userId,
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      type: data.type,
      config: data.config,
      credentialId: data.credentialId ?? null,
    })
    .returning();
  return tool;
}, { schema: createSchema });

const toggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

// PATCH /api/tool-definitions -- toggle active state
export const PATCH = h.mutation(async (data, userId) => {
  const [tool] = await db
    .update(toolDefinitions)
    .set({ isActive: data.isActive })
    .where(eq(toolDefinitions.id, data.id))
    .returning();
  return tool;
}, { schema: toggleSchema });
