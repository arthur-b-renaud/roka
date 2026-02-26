import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";
import { z } from "zod";
import { nanoid } from "nanoid";

// GET /api/nodes/:id/sharing — return visibility settings (owner only)
export const GET = h.GET(async (userId, _req, ctx) => {
  const { id } = ctx.params;

  const [node] = await db
    .select({
      id: nodes.id,
      visibility: nodes.visibility,
      shareToken: nodes.shareToken,
      publishedSlug: nodes.publishedSlug,
      publishedAt: nodes.publishedAt,
    })
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .limit(1);

  if (!node) throw new Error("Node not found");
  return node;
});

const updateSharingSchema = z.object({
  visibility: z.enum(["private", "team", "shared", "published"]),
  publishedSlug: z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
});

// PATCH /api/nodes/:id/sharing — update visibility (owner only)
export const PATCH = h.mutation(async (data, userId, _req, ctx) => {
  const { id } = ctx.params;

  const [existing] = await db
    .select({ id: nodes.id, shareToken: nodes.shareToken })
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .limit(1);

  if (!existing) throw new Error("Node not found");

  const update: Record<string, unknown> = { visibility: data.visibility };

  if (data.visibility === "shared" || data.visibility === "published") {
    if (!existing.shareToken) {
      update.shareToken = nanoid(21);
    }
  }

  if (data.visibility === "published") {
    if (!data.publishedSlug) {
      throw new Error("Invalid published slug: required when publishing");
    }
    update.publishedSlug = data.publishedSlug;
    update.publishedAt = new Date();
  }

  if (data.visibility === "private" || data.visibility === "team") {
    update.shareToken = null;
    update.publishedSlug = null;
    update.publishedAt = null;
  }

  const [updated] = await db
    .update(nodes)
    .set(update)
    .where(and(eq(nodes.id, id), eq(nodes.ownerId, userId)))
    .returning({
      id: nodes.id,
      visibility: nodes.visibility,
      shareToken: nodes.shareToken,
      publishedSlug: nodes.publishedSlug,
      publishedAt: nodes.publishedAt,
    });

  return updated;
}, { schema: updateSharingSchema });
