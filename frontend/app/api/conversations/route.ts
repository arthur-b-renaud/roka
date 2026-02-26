import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { parsePagination } from "@/lib/api-handler";
import { z } from "zod";

// GET /api/conversations
export const GET = h.GET(async (userId, req) => {
  const { limit } = parsePagination(req, { limit: 20 });

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.ownerId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
});

const createSchema = z.object({
  title: z.string().default("New conversation"),
  memberId: z.string().uuid().nullable().optional(),
});

// POST /api/conversations
export const POST = h.mutation(async (data, userId) => {
  const [conv] = await db
    .insert(conversations)
    .values({
      ownerId: userId,
      title: data.title,
      memberId: data.memberId ?? null,
    })
    .returning();
  return conv;
}, { schema: createSchema });
