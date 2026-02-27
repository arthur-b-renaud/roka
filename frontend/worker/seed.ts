/**
 * Seed built-in tool definitions if they don't exist. Idempotent.
 * Mirrors backend/graph/tools/registry.py seed_builtin_tools().
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { logger } from "./logger";

const BUILTIN_SEED = [
  {
    name: "search_knowledge_base",
    displayName: "Search Knowledge Base",
    description: "Full-text search across all workspace pages and databases.",
  },
  {
    name: "find_entities",
    displayName: "Find Entities",
    description: "Find people, organizations, or bots in workspace contacts.",
  },
  {
    name: "get_communications",
    displayName: "Get Communications",
    description: "Fetch recent communications (emails, Slack, webhooks).",
  },
  {
    name: "create_node",
    displayName: "Create Node",
    description: "Create a new page, task, or database row in the workspace.",
  },
  {
    name: "update_node_properties",
    displayName: "Update Node Properties",
    description: "Update metadata/properties on an existing node.",
  },
  {
    name: "append_text_to_page",
    displayName: "Append Text To Page",
    description: "Append plain text to a page as a new paragraph block.",
  },
];

export async function seedBuiltinTools(db: PostgresJsDatabase<typeof schema>) {
  for (const t of BUILTIN_SEED) {
    await db.execute(sql`
      INSERT INTO tool_definitions (owner_id, name, display_name, description, type)
      VALUES (NULL, ${t.name}, ${t.displayName}, ${t.description}, 'builtin')
      ON CONFLICT (name) WHERE (owner_id IS NULL) DO NOTHING
    `);
  }
  logger.info(`Seeded ${BUILTIN_SEED.length} built-in tool definitions`);
}
