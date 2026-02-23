import * as h from "@/lib/api-handler";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chatChannels } from "@/lib/db/schema";
import { assertChannelMembership } from "@/lib/chat";
import { ensureTeamMembership, isAdminOrOwner } from "@/lib/team";

const channelIdParamSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});

export const DELETE = h.GET(async (userId, _req, ctx) => {
  const params = channelIdParamSchema.safeParse(ctx.params);
  if (!params.success) {
    throw new Error(params.error.issues[0]?.message ?? "Invalid channel id");
  }
  const channelId = params.data.id;
  await assertChannelMembership(channelId, userId);
  const membership = await ensureTeamMembership(userId);

  const [channel] = await db
    .select({
      id: chatChannels.id,
      kind: chatChannels.kind,
      name: chatChannels.name,
      createdBy: chatChannels.createdBy,
    })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) {
    throw new Error("Channel not found");
  }
  if (channel.kind !== "channel") {
    throw new Error("Cannot delete direct conversations");
  }
  if (!isAdminOrOwner(membership.role) && channel.createdBy !== userId) {
    throw new Error("Forbidden");
  }

  await db.delete(chatChannels).where(eq(chatChannels.id, channelId));

  return { ok: true, deletedId: channelId };
});
