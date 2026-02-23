import { z } from "zod";

export const teamRoleSchema = z.enum(["owner", "admin", "member"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const dbTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: teamRoleSchema,
});

export type DbTeam = z.infer<typeof dbTeamSchema>;

export const dbTeamMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  role: teamRoleSchema,
  createdAt: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
});

export type DbTeamMember = z.infer<typeof dbTeamMemberSchema>;

export const dbTeamMessageSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  content: z.string(),
  createdAt: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  userImage: z.string().nullable(),
});

export type DbTeamMessage = z.infer<typeof dbTeamMessageSchema>;

export const dbChatChannelSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["channel", "direct"]),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DbChatChannel = z.infer<typeof dbChatChannelSchema>;

export const dbChatMessageSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
  content: z.string(),
  createdAt: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  userImage: z.string().nullable(),
});

export type DbChatMessage = z.infer<typeof dbChatMessageSchema>;
