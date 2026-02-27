/**
 * Workspace tools: create and update nodes (pages, tasks).
 * Port of backend/graph/tools/workspace.py.
 *
 * Factory functions that close over ownerId/taskId.
 */

import { tool } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { withActor } from "../with-actor";
import { randomUUID } from "crypto";

function buildParagraphBlock(text: string) {
  return {
    id: randomUUID(),
    type: "paragraph",
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

export function makeCreateNode(ownerId: string, taskId: string) {
  return tool({
    description:
      "Create a new page or task in the workspace. " +
      "Use this to generate action items, notes, or reference pages from agent analysis.",
    inputSchema: z.object({
      title: z.string().describe("Title for the new node"),
      node_type: z
        .enum(["page", "database", "database_row"])
        .default("page")
        .describe("Node type"),
      parent_id: z.string().optional().describe("UUID of parent node to nest under"),
      properties: z
        .string()
        .optional()
        .describe('JSON string of properties, e.g. \'{"status":"todo"}\''),
    }),
    execute: async ({ title, node_type, parent_id, properties }) => {
      let props: Record<string, unknown> = {};
      if (properties) {
        try { props = JSON.parse(properties); } catch { /* ignore */ }
      }
      props.source = "agent";
      const propsJson = JSON.stringify(props);
      const parentIdVal = parent_id || null;

      const row = await withActor("agent", taskId, async (tx) => {
        const res = await tx.execute(sql`
          INSERT INTO nodes (owner_id, parent_id, type, title, properties)
          VALUES (${ownerId}::uuid, ${parentIdVal}::uuid, ${node_type}::node_type, ${title}, ${propsJson}::jsonb)
          RETURNING id
        `);
        return res[0] as unknown as { id: string } | undefined;
      });

      return row ? `Created ${node_type} "${title}" with id=${row.id}` : "Failed to create node.";
    },
  });
}

export function makeUpdateNodeProperties(taskId: string) {
  return tool({
    description:
      "Update properties on an existing node (merge, not replace). " +
      "Use this to set status, priority, dates, or any metadata on a page or task.",
    inputSchema: z.object({
      node_id: z.string().describe("UUID of the node to update"),
      properties: z
        .string()
        .describe('JSON string of properties to merge, e.g. \'{"status":"done"}\''),
    }),
    execute: async ({ node_id, properties }) => {
      let props: Record<string, unknown>;
      try {
        props = JSON.parse(properties);
      } catch {
        return "Error: properties must be valid JSON.";
      }
      const propsJson = JSON.stringify(props);

      await withActor("agent", taskId, async (tx) => {
        await tx.execute(sql`
          UPDATE nodes
          SET properties = properties || ${propsJson}::jsonb, updated_at = now()
          WHERE id = ${node_id}::uuid
        `);
      });
      return `Updated node ${node_id} with ${JSON.stringify(props)}`;
    },
  });
}

export function makeAppendTextToPage(ownerId: string, taskId: string) {
  return tool({
    description: "Append text as a paragraph block to a page.",
    inputSchema: z.object({
      node_id: z.string().describe("UUID of the target page node"),
      text: z.string().describe("Text to append"),
    }),
    execute: async ({ node_id, text }) => {
      const trimmed = text.trim();
      if (!trimmed) return "Error: text cannot be empty.";

      const db = getDb();
      const rows = await db.execute(sql`
        SELECT content, type::text FROM nodes
        WHERE id = ${node_id}::uuid AND owner_id = ${ownerId}::uuid
      `);
      const row = rows[0] as unknown as { content: unknown[]; type: string } | undefined;
      if (!row) return "Error: page not found or access denied.";
      if (row.type !== "page") return `Error: node ${node_id} is type '${row.type}', expected 'page'.`;

      const content = Array.isArray(row.content) ? row.content : [];
      const updated = [...content, buildParagraphBlock(trimmed)];
      const contentJson = JSON.stringify(updated);

      await withActor("agent", taskId, async (tx) => {
        await tx.execute(sql`
          UPDATE nodes SET content = ${contentJson}::jsonb, updated_at = now()
          WHERE id = ${node_id}::uuid AND owner_id = ${ownerId}::uuid
        `);
      });

      return `Appended text to page ${node_id}`;
    },
  });
}
