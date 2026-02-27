/**
 * Dynamic tool registry: loads tools from tool_definitions table, dispatches
 * by type (builtin, http, platform). Wraps tools with owner_id / task_id context.
 * Port of backend/graph/tools/registry.py.
 */

import { sql } from "drizzle-orm";
import type { ToolSet } from "ai";
import { getDb } from "../db";
import { logger } from "../logger";
import { makeSearchKnowledgeBase, makeFindEntities, makeGetCommunications } from "./knowledge-base";
import { makeCreateNode, makeUpdateNodeProperties, makeAppendTextToPage } from "./workspace";
import { buildHttpTool } from "./http-tool";
import { buildPlatformTool } from "./platform/index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILTIN_FACTORIES: Record<string, (ownerId: string, taskId: string) => any> = {
  search_knowledge_base: (ownerId) => makeSearchKnowledgeBase(ownerId),
  find_entities: () => makeFindEntities(),
  get_communications: () => makeGetCommunications(),
  create_node: (ownerId, taskId) => makeCreateNode(ownerId, taskId),
  update_node_properties: (_ownerId, taskId) => makeUpdateNodeProperties(taskId),
  append_text_to_page: (ownerId, taskId) => makeAppendTextToPage(ownerId, taskId),
};

interface ToolDefRow {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  credential_id: string | null;
}

/**
 * Load tools for an agent run. Returns a ToolSet keyed by tool name.
 */
export async function loadToolsForAgent(
  ownerId: string,
  taskId: string,
  toolIds: string[] | null,
  minimalMode: boolean,
): Promise<ToolSet> {
  if (minimalMode) {
    return {
      search_knowledge_base: makeSearchKnowledgeBase(ownerId),
      append_text_to_page: makeAppendTextToPage(ownerId, taskId),
    };
  }

  const db = getDb();
  let rows: ToolDefRow[];

  if (toolIds && toolIds.length > 0) {
    const result = await db.execute(sql`
      SELECT id, name, type::text, config, credential_id
      FROM tool_definitions
      WHERE id = ANY(${toolIds}::uuid[]) AND is_active = true
    `);
    rows = result as unknown as ToolDefRow[];
  } else {
    const result = await db.execute(sql`
      SELECT id, name, type::text, config, credential_id
      FROM tool_definitions
      WHERE is_active = true AND (owner_id IS NULL OR owner_id = ${ownerId}::uuid)
    `);
    rows = result as unknown as ToolDefRow[];
  }

  const tools: ToolSet = {};

  for (const row of rows) {
    const name = row.name;
    const type = row.type;

    if (type === "builtin") {
      const factory = BUILTIN_FACTORIES[name];
      if (factory) {
        tools[name] = factory(ownerId, taskId);
      } else {
        logger.warn(`Built-in tool '${name}' not found in code`);
      }
    } else if (type === "http") {
      try {
        tools[name] = buildHttpTool(
          name,
          (row.config || {}) as Record<string, unknown>,
          row.credential_id,
        );
      } catch (e) {
        logger.warn(`Failed to build HTTP tool '${name}':`, e);
      }
    } else if (type === "platform") {
      try {
        const platformTools = await buildPlatformTool(
          name,
          (row.config || {}) as Record<string, unknown>,
          ownerId,
        );
        if (platformTools) {
          Object.assign(tools, platformTools);
        }
      } catch (e) {
        logger.warn(`Failed to build platform tool '${name}':`, e);
      }
    }
  }

  return tools;
}
