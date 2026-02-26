import { db } from "@/lib/db";
import { nodes } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import * as h from "@/lib/api-handler";

// GET /api/public/share/:token — fetch page by share link (no auth)
export const GET = h.publicGET(async (_req, ctx) => {
  const { token } = ctx.params;

  const [node] = await db
    .select({
      id: nodes.id,
      title: nodes.title,
      icon: nodes.icon,
      coverUrl: nodes.coverUrl,
      content: nodes.content,
      type: nodes.type,
      publishedAt: nodes.publishedAt,
    })
    .from(nodes)
    .where(
      and(
        eq(nodes.shareToken, token),
        inArray(nodes.visibility, ["shared", "published"]),
      ),
    )
    .limit(1);

  if (!node) throw new Error("Page not found");
  return node;
});
