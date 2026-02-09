import { db } from "@/lib/db";
import { agentDefinitions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/agent-definitions
export const GET = h.GET(async (userId) => {
  return db
    .select()
    .from(agentDefinitions)
    .where(eq(agentDefinitions.ownerId, userId))
    .orderBy(desc(agentDefinitions.updatedAt));
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  systemPrompt: z.string().default(""),
  model: z.string().default(""),
  toolIds: z.array(z.string().uuid()).default([]),
  trigger: z.enum(["manual", "schedule", "event"]).default("manual"),
  triggerConfig: z.record(z.unknown()).default({}),
});

// POST /api/agent-definitions -- create agent
export const POST = h.mutation(async (data, userId) => {
  const [agent] = await db
    .insert(agentDefinitions)
    .values({
      ownerId: userId,
      name: data.name,
      description: data.description,
      systemPrompt: data.systemPrompt,
      model: data.model,
      toolIds: data.toolIds,
      trigger: data.trigger,
      triggerConfig: data.triggerConfig,
    })
    .returning();
  return agent;
}, { schema: createSchema });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  toolIds: z.array(z.string().uuid()).optional(),
  trigger: z.enum(["manual", "schedule", "event"]).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/agent-definitions -- update agent
export const PATCH = h.mutation(async (data, userId) => {
  const { id, ...updates } = data;
  const [agent] = await db
    .update(agentDefinitions)
    .set(updates)
    .where(eq(agentDefinitions.id, id))
    .returning();
  return agent;
}, { schema: updateSchema });

const deleteSchema = z.object({
  id: z.string().uuid(),
});

// DELETE /api/agent-definitions
export const DELETE = h.mutation(async (data, userId) => {
  await db
    .delete(agentDefinitions)
    .where(eq(agentDefinitions.id, data.id));
  return { ok: true };
}, { schema: deleteSchema });
