/**
 * Knowledge base tools: search nodes, find entities, get communications.
 * Port of backend/graph/tools/knowledge_base.py.
 *
 * Each export is a factory that closes over ownerId so the tool execute
 * function receives no extra context (Vercel AI SDK constraint).
 */

import { tool } from "ai";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export function makeSearchKnowledgeBase(ownerId: string) {
  return tool({
    description:
      "Search across all pages and databases in the workspace using full-text search. " +
      "Use this to find relevant content by keywords or topics. " +
      "Returns titles, types, and text snippets for matching nodes.",
    inputSchema: z.object({
      query: z.string().describe("Search terms (natural language or keywords)"),
      limit: z.number().default(10).describe("Max results to return"),
    }),
    execute: async ({ query, limit }) => {
      const db = getDb();

      type Row = { id: string; title: string; type: string; parent_id: string | null; snippet: string };

      let rows = await db.execute(sql`
        SELECT n.id, n.title, n.type::text, n.parent_id,
               ts_headline('english', n.search_text, plainto_tsquery('english', ${query}),
                   'StartSel=**, StopSel=**, MaxWords=50, MinWords=20') AS snippet,
               ts_rank(to_tsvector('english', n.search_text),
                   plainto_tsquery('english', ${query})) AS rank
        FROM nodes n
        WHERE n.owner_id = ${ownerId}::uuid
          AND to_tsvector('english', n.search_text) @@ plainto_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);

      let rowList = rows as unknown as Row[];

      if (rowList.length === 0) {
        rows = await db.execute(sql`
          SELECT n.id, n.title, n.type::text, n.parent_id,
                 LEFT(n.search_text, 200) AS snippet,
                 similarity(n.search_text, ${query}) AS rank
          FROM nodes n
          WHERE n.owner_id = ${ownerId}::uuid
            AND n.search_text % ${query}
          ORDER BY rank DESC
          LIMIT ${limit}
        `);
        rowList = rows as unknown as Row[];
      }

      if (rowList.length === 0) return "No results found.";

      const results = rowList.map(
        (r) => `- [${r.type}] "${r.title}" (id=${r.id})\n  ${r.snippet}`,
      );
      return `Found ${rowList.length} results:\n${results.join("\n")}`;
    },
  });
}

export function makeFindEntities() {
  return tool({
    description:
      "Find people, organizations, or bots in the workspace contacts. " +
      "Use this to look up contacts by name or type before sending emails or referencing them in tasks.",
    inputSchema: z.object({
      name: z.string().optional().describe("Partial name to search for (fuzzy match)"),
      entity_type: z
        .enum(["person", "org", "bot"])
        .optional()
        .describe("Filter by entity type"),
      limit: z.number().default(10).describe("Max results"),
    }),
    execute: async ({ name, entity_type, limit }) => {
      const db = getDb();
      const namePattern = name ? `%${name}%` : null;

      type Row = { id: string; display_name: string; type: string; resolution_keys: unknown[] };
      let rows: Row[];

      if (name && entity_type) {
        const r = await db.execute(sql`
          SELECT id, display_name, type::text, resolution_keys
          FROM entities
          WHERE display_name ILIKE ${namePattern} AND type = ${entity_type}::entity_type
          ORDER BY created_at DESC LIMIT ${limit}
        `);
        rows = r as unknown as Row[];
      } else if (name) {
        const r = await db.execute(sql`
          SELECT id, display_name, type::text, resolution_keys
          FROM entities
          WHERE display_name ILIKE ${namePattern}
          ORDER BY created_at DESC LIMIT ${limit}
        `);
        rows = r as unknown as Row[];
      } else if (entity_type) {
        const r = await db.execute(sql`
          SELECT id, display_name, type::text, resolution_keys
          FROM entities
          WHERE type = ${entity_type}::entity_type
          ORDER BY created_at DESC LIMIT ${limit}
        `);
        rows = r as unknown as Row[];
      } else {
        const r = await db.execute(sql`
          SELECT id, display_name, type::text, resolution_keys
          FROM entities
          ORDER BY created_at DESC LIMIT ${limit}
        `);
        rows = r as unknown as Row[];
      }

      if (rows.length === 0) return "No entities found.";

      const results = rows.map((r) => {
        const keys = Array.isArray(r.resolution_keys) ? r.resolution_keys : [];
        const email = keys.find((k) => typeof k === "string" && k.includes("@"));
        return `- ${r.display_name} (${r.type}) id=${r.id}${email ? ` email=${email}` : ""}`;
      });
      return `Found ${rows.length} entities:\n${results.join("\n")}`;
    },
  });
}

export function makeGetCommunications() {
  return tool({
    description:
      "Fetch recent communications (emails, Slack messages, webhooks). " +
      "Use this to review conversation history with a contact or check recent inbound signals.",
    inputSchema: z.object({
      entity_id: z.string().optional().describe("Filter by sender entity UUID"),
      channel: z
        .enum(["email", "slack", "sms", "webhook", "other"])
        .optional()
        .describe("Filter by channel"),
      limit: z.number().default(5).describe("Max results"),
    }),
    execute: async ({ entity_id, channel, limit }) => {
      const db = getDb();

      // Simple approach: use conditional sql
      if (entity_id && channel) {
        const rows = await db.execute(sql`
          SELECT c.id, c.channel::text, c.direction::text, c.subject,
                 LEFT(c.content_text, 300) AS content_preview, c.timestamp,
                 e.display_name AS from_name
          FROM communications c LEFT JOIN entities e ON e.id = c.from_entity_id
          WHERE c.from_entity_id = ${entity_id}::uuid AND c.channel = ${channel}::comm_channel
          ORDER BY c.timestamp DESC LIMIT ${limit}
        `);
        return formatComms(rows as unknown as CommRow[]);
      } else if (entity_id) {
        const rows = await db.execute(sql`
          SELECT c.id, c.channel::text, c.direction::text, c.subject,
                 LEFT(c.content_text, 300) AS content_preview, c.timestamp,
                 e.display_name AS from_name
          FROM communications c LEFT JOIN entities e ON e.id = c.from_entity_id
          WHERE c.from_entity_id = ${entity_id}::uuid
          ORDER BY c.timestamp DESC LIMIT ${limit}
        `);
        return formatComms(rows as unknown as CommRow[]);
      } else if (channel) {
        const rows = await db.execute(sql`
          SELECT c.id, c.channel::text, c.direction::text, c.subject,
                 LEFT(c.content_text, 300) AS content_preview, c.timestamp,
                 e.display_name AS from_name
          FROM communications c LEFT JOIN entities e ON e.id = c.from_entity_id
          WHERE c.channel = ${channel}::comm_channel
          ORDER BY c.timestamp DESC LIMIT ${limit}
        `);
        return formatComms(rows as unknown as CommRow[]);
      } else {
        const rows = await db.execute(sql`
          SELECT c.id, c.channel::text, c.direction::text, c.subject,
                 LEFT(c.content_text, 300) AS content_preview, c.timestamp,
                 e.display_name AS from_name
          FROM communications c LEFT JOIN entities e ON e.id = c.from_entity_id
          ORDER BY c.timestamp DESC LIMIT ${limit}
        `);
        return formatComms(rows as unknown as CommRow[]);
      }
    },
  });
}

interface CommRow {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  content_preview: string | null;
  timestamp: string;
  from_name: string | null;
}

function formatComms(rows: CommRow[]): string {
  if (rows.length === 0) return "No communications found.";
  const results = rows.map((r) => {
    const from = r.from_name || "Unknown";
    const subj = r.subject || "(no subject)";
    return (
      `- [${r.channel}/${r.direction}] From: ${from} | Subject: ${subj}\n` +
      `  ${r.content_preview || "(empty)"}\n` +
      `  Time: ${r.timestamp}`
    );
  });
  return `Found ${rows.length} communications:\n${results.join("\n")}`;
}
