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
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const checkpoints = pgTable("checkpoints", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => agentTasks.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull(),
  checkpoint: jsonb("checkpoint").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const writes = pgTable("writes", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
  tableName: text("table_name").notNull(),
  rowId: uuid("row_id").notNull(),
  operation: text("operation").notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Zone D: App Settings ───────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Relations ──────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  nodes: many(nodes),
  agentTasks: many(agentTasks),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  parent: one(nodes, { fields: [nodes.parentId], references: [nodes.id], relationName: "parentChild" }),
  children: many(nodes, { relationName: "parentChild" }),
  owner: one(users, { fields: [nodes.ownerId], references: [users.id] }),
  databaseDefinition: one(databaseDefinitions, { fields: [nodes.id], references: [databaseDefinitions.nodeId] }),
  views: many(databaseViews),
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
}));
