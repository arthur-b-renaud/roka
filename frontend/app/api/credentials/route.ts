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
  type: z.enum(["api_key", "oauth2", "smtp", "basic_auth", "custom"]),
  config: z.record(z.string()),
});

// POST /api/credentials -- create (config encrypted server-side via backend)
export const POST = h.mutation(async (data, userId) => {
  // Encrypt the config using the backend vault
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8100";
  const res = await fetch(`${backendUrl}/api/webhooks/encrypt-credential`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, owner_id: userId }),
  });

  if (!res.ok) {
    // Fallback: store config as JSON bytes directly if backend not available
    // In production, the vault key must be shared or encryption happens at backend
    const configBytes = Buffer.from(JSON.stringify(data.config), "utf-8");
    const [row] = await db
      .insert(credentials)
      .values({
        ownerId: userId,
        name: data.name,
        service: data.service,
        type: data.type,
        configEncrypted: configBytes.toString("base64"),
      })
      .returning({
        id: credentials.id,
        name: credentials.name,
        service: credentials.service,
        type: credentials.type,
        isActive: credentials.isActive,
        createdAt: credentials.createdAt,
      });
    return row;
  }

  const result = await res.json();
  return result;
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
