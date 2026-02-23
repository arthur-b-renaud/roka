import * as h from "@/lib/api-handler";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

export const GET = h.GET(async (userId) => {
  const membership = await ensureTeamMembership(userId);
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, membership.teamId))
    .limit(1);

  return { ...team, role: membership.role };
});

const patchSchema = z.object({
  name: z.string().min(1).max(100),
});

export const PATCH = h.mutation(
  async (data, userId) => {
    const membership = await ensureTeamMembership(userId);
    if (!isAdminOrOwner(membership.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(teams)
      .set({ name: data.name })
      .where(eq(teams.id, membership.teamId))
      .returning();

    return updated;
  },
  { schema: patchSchema },
);
