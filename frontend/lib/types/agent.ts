import { z } from "zod";

// ── Credential Types ────────────────────────────────────

export const credentialTypeSchema = z.enum(["api_key", "oauth2", "basic_auth", "custom"]);

export const dbCredentialSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  service: z.string(),
  type: credentialTypeSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DbCredential = z.infer<typeof dbCredentialSchema>;

export const createCredentialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  service: z.string().min(1, "Service is required"),
  type: credentialTypeSchema,
  config: z.record(z.string()),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

// ── Tool Definition Types ───────────────────────────────

export const toolTypeSchema = z.enum(["builtin", "http", "custom", "platform"]);

export const dbToolDefinitionSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid().nullable(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  type: toolTypeSchema,
  config: z.record(z.unknown()),
  credentialId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DbToolDefinition = z.infer<typeof dbToolDefinitionSchema>;

export const createToolSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().default(""),
  type: toolTypeSchema.default("http"),
  config: z.record(z.unknown()).default({}),
  credentialId: z.string().uuid().nullable().optional(),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;

// ── Conversation Types ──────────────────────────────────

export const messageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);

export const dbConversationSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string(),
  memberId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DbConversation = z.infer<typeof dbConversationSchema>;

export const dbMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: messageRoleSchema,
  content: z.string(),
  metadata: z.record(z.unknown()),
  taskId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export type DbMessage = z.infer<typeof dbMessageSchema>;

// Agent definitions are now unified into team_members (kind='ai').
// See lib/types/team.ts for DbTeamMember which covers both human and AI members.

export const triggerTypeSchema = z.enum(["manual", "schedule", "event"]);

// ── Telemetry Types ─────────────────────────────────────

export const dbTelemetrySpanSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  kind: z.string(),
  status: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  durationMs: z.number().nullable(),
  attributes: z.record(z.unknown()),
  events: z.array(z.unknown()),
  taskId: z.string().uuid().nullable(),
});

export type DbTelemetrySpan = z.infer<typeof dbTelemetrySpanSchema>;

// ── Actor Type (attribution) ────────────────────────────

export const actorTypeSchema = z.enum(["human", "agent"]);
export type ActorType = z.infer<typeof actorTypeSchema>;
