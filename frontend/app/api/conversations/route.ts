import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";

// GET /api/conversations -- list conversations
export const GET = h.GET(async (userId, req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.ownerId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
});

const createSchema = z.object({
  title: z.string().default("New conversation"),
  agentDefinitionId: z.string().uuid().nullable().optional(),
});

// POST /api/conversations -- create a new conversation
export const POST = h.mutation(async (data, userId) => {
  const [conv] = await db
    .insert(conversations)
    .values({
      ownerId: userId,
      title: data.title,
      agentDefinitionId: data.agentDefinitionId ?? null,
    })
    .returning();
  return conv;
}, { schema: createSchema });
