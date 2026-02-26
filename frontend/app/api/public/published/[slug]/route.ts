import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as h from "@/lib/api-handler";

// GET /api/public/published/:slug — fetch published page by slug (no auth)
export const GET = h.publicGET(async (_req, ctx) => {
  const { slug } = ctx.params;

  const [node] = await db
    .select({
      id: nodes.id,
      title: nodes.title,
      icon: nodes.icon,
      coverUrl: nodes.coverUrl,
      content: nodes.content,
      type: nodes.type,
      publishedSlug: nodes.publishedSlug,
      publishedAt: nodes.publishedAt,
    })
    .from(nodes)
    .where(
      and(
        eq(nodes.publishedSlug, slug),
        eq(nodes.visibility, "published"),
      ),
    )
    .limit(1);

  if (!node) throw new Error("Page not found");
  return node;
});
