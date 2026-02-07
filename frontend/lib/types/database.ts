export interface DbNode {
  id: string;
  parent_id: string | null;
  owner_id: string;
  type: "page" | "database" | "database_row" | "image";
  title: string;
  icon: string | null;
  cover_url: string | null;
  content: unknown[];
  properties: Record<string, unknown>;
  is_pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  search_text: string;
}

export interface DbAgentTask {
  id: string;
  owner_id: string;
  workflow: "summarize" | "triage" | "custom";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  node_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDatabaseDefinition {
  id: string;
  node_id: string;
  schema_config: SchemaColumn[];
  created_at: string;
  updated_at: string;
}

export interface SchemaColumn {
  key: string;
  name: string;
  type: "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url" | "person";
  options?: string[];
}

export interface SearchResult {
  id: string;
  title: string;
  type: "page" | "database" | "database_row" | "image";
  parent_id: string | null;
  snippet: string;
  rank: number;
}

export interface AppSetting {
  key: string;
  value: string;
  is_secret: boolean;
  updated_at: string;
}
