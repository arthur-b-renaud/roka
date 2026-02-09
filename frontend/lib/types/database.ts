import { z } from "zod";

// ──────────────────────────────────────────────
// Zod schemas (source of truth)
// ──────────────────────────────────────────────

export const nodeTypeSchema = z.enum(["page", "database", "database_row", "image"]);

export const dbNodeSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  ownerId: z.string().uuid(),
  type: nodeTypeSchema,
  title: z.string(),
  icon: z.string().nullable(),
  coverUrl: z.string().nullable(),
  content: z.array(z.unknown()),
  properties: z.record(z.unknown()),
  isPinned: z.boolean(),
  sortOrder: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  searchText: z.string(),
});

export const agentTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const workflowTypeSchema = z.enum(["summarize", "triage", "agent", "custom"]);

export const dbAgentTaskSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  workflow: workflowTypeSchema,
  status: agentTaskStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  nodeId: z.string().uuid().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const schemaColumnTypeSchema = z.enum([
  "text", "number", "select", "multi_select", "date", "checkbox", "url", "person",
]);

export const schemaColumnSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: schemaColumnTypeSchema,
  options: z.array(z.string()).optional(),
});

export const dbDatabaseDefinitionSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
  schemaConfig: z.array(schemaColumnSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ──────────────────────────────────────────────
// Database Views
// ──────────────────────────────────────────────

export const viewSortSchema = z.object({
  columnKey: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export const viewFilterSchema = z.object({
  columnKey: z.string(),
  operator: z.string(),
  value: z.unknown().optional(),
});

export const viewTypeSchema = z.enum(["table", "board"]);

export const viewConfigSchema = z.object({
  viewType: viewTypeSchema.default("table"),
  sorts: z.array(viewSortSchema).default([]),
  filters: z.array(viewFilterSchema).default([]),
  columnOrder: z.array(z.string()).default([]),
  hiddenColumns: z.array(z.string()).default([]),
  groupBy: z.string().optional(), // column key for board grouping
});

export const dbDatabaseViewSchema = z.object({
  id: z.string().uuid(),
  databaseId: z.string().uuid(),
  name: z.string(),
  viewConfig: viewConfigSchema,
  sortOrder: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const searchResultSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: nodeTypeSchema,
  parentId: z.string().uuid().nullable(),
  snippet: z.string(),
  rank: z.number(),
});

export const appSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  isSecret: z.boolean(),
  updatedAt: z.string(),
});

// Param validation
export const uuidSchema = z.string().uuid();

// ──────────────────────────────────────────────
// Derived TypeScript types
// ──────────────────────────────────────────────

export type DbNode = z.infer<typeof dbNodeSchema>;
export type DbAgentTask = z.infer<typeof dbAgentTaskSchema>;
export type DbDatabaseDefinition = z.infer<typeof dbDatabaseDefinitionSchema>;
export type SchemaColumn = z.infer<typeof schemaColumnSchema>;
export type ViewSort = z.infer<typeof viewSortSchema>;
export type ViewFilter = z.infer<typeof viewFilterSchema>;
export type ViewType = z.infer<typeof viewTypeSchema>;
export type ViewConfig = z.infer<typeof viewConfigSchema>;
export type DbDatabaseView = z.infer<typeof dbDatabaseViewSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type AppSetting = z.infer<typeof appSettingSchema>;
