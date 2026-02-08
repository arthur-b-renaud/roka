import { z } from "zod";

// ──────────────────────────────────────────────
// Zod schemas (source of truth)
// ──────────────────────────────────────────────

export const nodeTypeSchema = z.enum(["page", "database", "database_row", "image"]);

export const dbNodeSchema = z.object({
  id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  owner_id: z.string().uuid(),
  type: nodeTypeSchema,
  title: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
  content: z.array(z.unknown()),
  properties: z.record(z.unknown()),
  is_pinned: z.boolean(),
  sort_order: z.number().int().min(0),
  created_at: z.string(),
  updated_at: z.string(),
  search_text: z.string(),
});

export const agentTaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const workflowTypeSchema = z.enum(["summarize", "triage", "agent", "custom"]);

export const dbAgentTaskSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  workflow: workflowTypeSchema,
  status: agentTaskStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  node_id: z.string().uuid().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
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
  node_id: z.string().uuid(),
  schema_config: z.array(schemaColumnSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

export const searchResultSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: nodeTypeSchema,
  parent_id: z.string().uuid().nullable(),
  snippet: z.string(),
  rank: z.number(),
});

export const appSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  is_secret: z.boolean(),
  updated_at: z.string(),
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
export type SearchResult = z.infer<typeof searchResultSchema>;
export type AppSetting = z.infer<typeof appSettingSchema>;
