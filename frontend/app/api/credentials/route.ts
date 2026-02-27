import { db } from "@/lib/db";
import { credentials } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/credentials -- list credentials (without decrypted config)
export const GET = h.GET(async (userId) => {
  return db
    .select({
      id: credentials.id,
      ownerId: credentials.ownerId,
      name: credentials.name,
      service: credentials.service,
      type: credentials.type,
      isActive: credentials.isActive,
      createdAt: credentials.createdAt,
      updatedAt: credentials.updatedAt,
    })
    .from(credentials)
    .where(eq(credentials.ownerId, userId))
    .orderBy(desc(credentials.createdAt));
});

const createSchema = z.object({
  name: z.string().min(1),
  service: z.string().min(1),
  type: z.enum(["api_key", "oauth2", "basic_auth", "custom"]),
  config: z.record(z.string()),
});

// POST /api/credentials -- create (config encrypted via vault)
export const POST = h.mutation(async (data, userId) => {
  const { createCredential } = await import("@/lib/vault");
  const credential = await createCredential(db, {
    ownerId: userId,
    name: data.name,
    service: data.service,
    type: data.type,
    config: data.config as Record<string, unknown>,
  });
  return {
    id: credential.id,
    name: credential.name,
    service: credential.service,
    type: credential.type,
    isActive: credential.isActive,
    createdAt: credential.createdAt,
  };
}, { schema: createSchema });

const deleteSchema = z.object({
  id: z.string().uuid(),
});

// DELETE /api/credentials
export const DELETE = h.mutation(async (data, userId) => {
  await db
    .delete(credentials)
    .where(and(eq(credentials.id, data.id), eq(credentials.ownerId, userId)));
  return { ok: true };
}, { schema: deleteSchema });
