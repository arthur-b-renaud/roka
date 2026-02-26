import { z } from "zod";

export const teamRoleSchema = z.enum(["owner", "admin", "member"]);
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const memberKindSchema = z.enum(["human", "ai"]);
export type MemberKind = z.infer<typeof memberKindSchema>;

export const triggerTypeSchema = z.enum(["manual", "schedule", "event"]);
export const pageAccessLevelSchema = z.enum(["all", "selected"]);

export const dbTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: teamRoleSchema,
});

export type DbTeam = z.infer<typeof dbTeamSchema>;

// Unified team member: covers both human users and AI agents
export const dbTeamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  userId: z.string().uuid().nullable(),
  kind: memberKindSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  description: z.string(),
  // Permissions
  role: teamRoleSchema,
  pageAccess: pageAccessLevelSchema,
  allowedNodeIds: z.array(z.string()).default([]),
  canWrite: z.boolean(),
  // AI config
  systemPrompt: z.string(),
  model: z.string(),
  toolIds: z.array(z.string()).default([]),
  trigger: triggerTypeSchema,
  triggerConfig: z.record(z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Joined from users table for humans
  email: z.string().optional(),
  image: z.string().nullable().optional(),
});

export type DbTeamMember = z.infer<typeof dbTeamMemberSchema>;

export const createMemberSchema = z.object({
  kind: memberKindSchema,
  // Human invite
  email: z.string().email().optional(),
  // Identity
  displayName: z.string().min(1, "Name is required").optional(),
  description: z.string().default(""),
  // Permissions
  role: teamRoleSchema.default("member"),
  pageAccess: pageAccessLevelSchema.default("all"),
  allowedNodeIds: z.array(z.string().uuid()).default([]),
  canWrite: z.boolean().default(true),
  // AI config
  systemPrompt: z.string().default(""),
  model: z.string().default(""),
  toolIds: z.array(z.string().uuid()).default([]),
  trigger: triggerTypeSchema.default("manual"),
  triggerConfig: z.record(z.unknown()).default({}),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  role: z.enum(["admin", "member"]).optional(),
  pageAccess: pageAccessLevelSchema.optional(),
  allowedNodeIds: z.array(z.string().uuid()).optional(),
  canWrite: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  toolIds: z.array(z.string().uuid()).optional(),
  trigger: triggerTypeSchema.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

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
  content: z.string(),
  authorMemberId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  // Joined from team_members
  authorName: z.string().nullable().optional(),
  authorKind: memberKindSchema.nullable().optional(),
  authorAvatarUrl: z.string().nullable().optional(),
});

export type DbChatMessage = z.infer<typeof dbChatMessageSchema>;

export const dbChatChannelMemberSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
  displayName: z.string(),
  kind: memberKindSchema,
  avatarUrl: z.string().nullable().optional(),
  role: teamRoleSchema,
  // For humans, joined from users
  email: z.string().optional(),
  image: z.string().nullable().optional(),
});

export type DbChatChannelMember = z.infer<typeof dbChatChannelMemberSchema>;
