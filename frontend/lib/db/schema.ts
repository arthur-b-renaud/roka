/**
 * Drizzle ORM schema — mirrors database/init.sql.
 * Auth.js tables (users, accounts, sessions, verification_tokens) added here.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────

export const entityTypeEnum = pgEnum("entity_type", ["person", "org", "bot"]);
export const commChannelEnum = pgEnum("comm_channel", ["email", "slack", "sms", "webhook", "other"]);
export const commDirectionEnum = pgEnum("comm_direction", ["inbound", "outbound"]);
export const nodeTypeEnum = pgEnum("node_type", ["page", "database", "database_row", "image"]);
export const agentTaskStatusEnum = pgEnum("agent_task_status", ["pending", "running", "completed", "failed", "cancelled"]);
export const workflowTypeEnum = pgEnum("workflow_type", ["summarize", "triage", "agent", "custom"]);

// ── Auth.js Tables ─────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

// ── Zone A: Entities & Communications ──────────────────

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  type: entityTypeEnum("type").notNull().default("person"),
  resolutionKeys: jsonb("resolution_keys").notNull().default([]),
  contextVector: text("context_vector"), // pgvector — stored as text in drizzle
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const communications = pgTable("communications", {
  id: uuid("id").defaultRandom().primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  channel: commChannelEnum("channel").notNull(),
  direction: commDirectionEnum("direction").notNull(),
  fromEntityId: uuid("from_entity_id").references(() => entities.id, { onDelete: "set null" }),
  toEntityIds: text("to_entity_ids"), // UUID[] stored as text
  subject: text("subject"),
  contentText: text("content_text"),
  rawPayload: jsonb("raw_payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone B: Nodes, Edges, DB Definitions ───────────────

export const nodes = pgTable("nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: uuid("parent_id").references((): any => nodes.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: nodeTypeEnum("type").notNull().default("page"),
  title: text("title").notNull().default(""),
  icon: text("icon"),
  coverUrl: text("cover_url"),
  content: jsonb("content").notNull().default([]),
  properties: jsonb("properties").notNull().default({}),
  isPinned: boolean("is_pinned").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  searchText: text("search_text").notNull().default(""),
});

export const edges = pgTable("edges", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("link"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const databaseDefinitions = pgTable("database_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  nodeId: uuid("node_id").notNull().unique().references(() => nodes.id, { onDelete: "cascade" }),
  schemaConfig: jsonb("schema_config").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const databaseViews = pgTable("database_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  databaseId: uuid("database_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Default view"),
  viewConfig: jsonb("view_config").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id").references(() => nodes.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  s3Key: text("s3_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone C: Agent State ────────────────────────────────

export const agentTasks = pgTable("agent_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  workflow: workflowTypeEnum("workflow").notNull(),
  status: agentTaskStatusEnum("status").notNull().default("pending"),
  input: jsonb("input").notNull().default({}),
  output: jsonb("output"),
  error: text("error"),
  nodeId: uuid("node_id").references(() => nodes.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references((): any => conversations.id, { onDelete: "set null" }),
  agentDefinitionId: uuid("agent_definition_id").references((): any => agentDefinitions.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  traceLog: jsonb("trace_log").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const writes = pgTable("writes", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
  tableName: text("table_name").notNull(),
  rowId: uuid("row_id").notNull(),
  operation: text("operation").notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  actorType: text("actor_type").notNull().default("agent"),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodeRevisions = pgTable("node_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  nodeId: uuid("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  operation: text("operation").notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  changedFields: text("changed_fields").array(),
  actorType: text("actor_type").notNull().default("system"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone D: App Settings ───────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone E: Credential Vault ───────────────────────────

export const credentialTypeEnum = pgEnum("credential_type", ["api_key", "oauth2", "basic_auth", "custom"]);

export const credentials = pgTable("credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  service: text("service").notNull().default(""),
  type: credentialTypeEnum("type").notNull(),
  configEncrypted: text("config_encrypted").notNull(), // bytea mapped as text in drizzle
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone F: Tool Definitions ───────────────────────────

export const toolTypeEnum = pgEnum("tool_type", ["builtin", "http", "custom", "platform"]);

export const toolDefinitions = pgTable("tool_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull().default(""),
  type: toolTypeEnum("type").notNull().default("builtin"),
  config: jsonb("config").notNull().default({}),
  credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone G: Conversations ──────────────────────────────

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system", "tool"]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  agentDefinitionId: uuid("agent_definition_id").references((): any => agentDefinitions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull().default(""),
  metadata: jsonb("metadata").notNull().default({}),
  taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone H: Agent Definitions ──────────────────────────

export const triggerTypeEnum = pgEnum("trigger_type", ["manual", "schedule", "event"]);

export const agentDefinitions = pgTable("agent_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  model: text("model").notNull().default(""),
  toolIds: text("tool_ids").array(), // UUID[] stored as text array in drizzle
  trigger: triggerTypeEnum("trigger").notNull().default("manual"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone J: Teams & Internal Chat ──────────────────────

export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "member"]);
export const chatChannelKindEnum = pgEnum("chat_channel_kind", ["channel", "direct"]);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().default("My Workspace"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    teamUser: uniqueIndex("uq_team_members_team_user").on(table.teamId, table.userId),
  }),
);

export const teamMessages = pgTable("team_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  kind: chatChannelKindEnum("kind").notNull().default("channel"),
  name: text("name"),
  dmKey: text("dm_key"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqChannelUser: uniqueIndex("uq_chat_channel_members_channel_user").on(table.channelId, table.userId),
  }),
);

export const chatChannelMessages = pgTable("chat_channel_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone I: Telemetry ──────────────────────────────────

export const telemetrySpans = pgTable("telemetry_spans", {
  id: uuid("id").defaultRandom().primaryKey(),
  traceId: text("trace_id").notNull(),
  spanId: text("span_id").notNull(),
  parentSpanId: text("parent_span_id"),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("INTERNAL"),
  status: text("status").notNull().default("OK"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationMs: text("duration_ms"), // double precision mapped as text
  attributes: jsonb("attributes").notNull().default({}),
  events: jsonb("events").notNull().default([]),
  taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
});

// ── Relations ──────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  nodes: many(nodes),
  files: many(files),
  agentTasks: many(agentTasks),
  accounts: many(accounts),
  sessions: many(sessions),
  credentials: many(credentials),
  conversations: many(conversations),
  agentDefinitions: many(agentDefinitions),
  teamMemberships: many(teamMembers),
  teamMessages: many(teamMessages),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  parent: one(nodes, { fields: [nodes.parentId], references: [nodes.id], relationName: "parentChild" }),
  children: many(nodes, { relationName: "parentChild" }),
  owner: one(users, { fields: [nodes.ownerId], references: [users.id] }),
  databaseDefinition: one(databaseDefinitions, { fields: [nodes.id], references: [databaseDefinitions.nodeId] }),
  views: many(databaseViews),
  files: many(files),
  revisions: many(nodeRevisions),
}));

export const nodeRevisionsRelations = relations(nodeRevisions, ({ one }) => ({
  node: one(nodes, { fields: [nodeRevisions.nodeId], references: [nodes.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  owner: one(users, { fields: [files.ownerId], references: [users.id] }),
  node: one(nodes, { fields: [files.nodeId], references: [nodes.id] }),
}));

export const databaseDefinitionsRelations = relations(databaseDefinitions, ({ one }) => ({
  node: one(nodes, { fields: [databaseDefinitions.nodeId], references: [nodes.id] }),
}));

export const databaseViewsRelations = relations(databaseViews, ({ one }) => ({
  database: one(nodes, { fields: [databaseViews.databaseId], references: [nodes.id] }),
}));

export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  owner: one(users, { fields: [agentTasks.ownerId], references: [users.id] }),
  node: one(nodes, { fields: [agentTasks.nodeId], references: [nodes.id] }),
  conversation: one(conversations, { fields: [agentTasks.conversationId], references: [conversations.id] }),
  agentDefinition: one(agentDefinitions, { fields: [agentTasks.agentDefinitionId], references: [agentDefinitions.id] }),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  owner: one(users, { fields: [credentials.ownerId], references: [users.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  owner: one(users, { fields: [conversations.ownerId], references: [users.id] }),
  agentDefinition: one(agentDefinitions, { fields: [conversations.agentDefinitionId], references: [agentDefinitions.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  agentTask: one(agentTasks, { fields: [messages.taskId], references: [agentTasks.id] }),
}));

export const agentDefinitionsRelations = relations(agentDefinitions, ({ one }) => ({
  owner: one(users, { fields: [agentDefinitions.ownerId], references: [users.id] }),
}));

export const toolDefinitionsRelations = relations(toolDefinitions, ({ one }) => ({
  owner: one(users, { fields: [toolDefinitions.ownerId], references: [users.id] }),
  credential: one(credentials, { fields: [toolDefinitions.credentialId], references: [credentials.id] }),
}));

// ── Team Relations ─────────────────────────────────────

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  messages: many(teamMessages),
  chatChannels: many(chatChannels),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const teamMessagesRelations = relations(teamMessages, ({ one }) => ({
  team: one(teams, { fields: [teamMessages.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMessages.userId], references: [users.id] }),
}));

export const chatChannelsRelations = relations(chatChannels, ({ one, many }) => ({
  team: one(teams, { fields: [chatChannels.teamId], references: [teams.id] }),
  members: many(chatChannelMembers),
  messages: many(chatChannelMessages),
  creator: one(users, { fields: [chatChannels.createdBy], references: [users.id] }),
}));

export const chatChannelMembersRelations = relations(chatChannelMembers, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatChannelMembers.channelId], references: [chatChannels.id] }),
  user: one(users, { fields: [chatChannelMembers.userId], references: [users.id] }),
}));

export const chatChannelMessagesRelations = relations(chatChannelMessages, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatChannelMessages.channelId], references: [chatChannels.id] }),
  user: one(users, { fields: [chatChannelMessages.userId], references: [users.id] }),
}));
