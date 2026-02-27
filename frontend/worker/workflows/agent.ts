/**
 * ReAct agent workflow — conversational agent with dynamic tools.
 * Port of backend/graph/workflows/agent.py using Vercel AI SDK.
 *
 * Full implementation in Phase 2.
 */

import { generateText, stepCountIs } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getModel } from "../llm";
import { withActor } from "../with-actor";
import { logger } from "../logger";
import { loadToolsForAgent } from "../tools/registry";

const SENSITIVE_KEY_PATTERNS = [
  "token", "secret", "password", "api_key", "authorization", "cookie", "key",
];

const DEFAULT_SYSTEM_PROMPT = `You are Roka, an AI workspace assistant. You help users manage their knowledge base, triage incoming information, and take actions.

## Your capabilities
- Search the workspace knowledge base (pages, databases, notes)
- Find and look up contacts (entities) and their communication history
- Create new pages and tasks in the workspace
- Update properties on existing pages (status, priority, dates, etc.)
- Use any external tools that have been configured (Gmail, Slack, search, etc.)

## Guidelines
- Always search the knowledge base first when a user asks about existing content.
- When creating tasks, set clear titles and relevant properties.
- Be concise and action-oriented. Summarize what you did after completing actions.
- If you lack information to complete a request, say so clearly rather than guessing.`;

const MINIMAL_SYSTEM_PROMPT = `You are a minimal workspace assistant focused on page actions.

You can:
- read workspace content with search_knowledge_base
- append user-approved text to a page with append_text_to_page

Rules:
- Keep responses short and explicit.
- Before writing, confirm target page intent from the user prompt.
- If node_id is missing, ask the user to open a page and retry.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lowered.includes(p));
}

function redactPayload(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      redacted[k] = isSensitiveKey(k) ? "***REDACTED***" : redactPayload(v);
    }
    return redacted;
  }
  if (Array.isArray(value)) return value.map(redactPayload);
  if (typeof value === "string") {
    let s = value.slice(0, 4000);
    s = s.replace(/(?:bearer\s+)[a-z0-9._-]+/gi, "bearer ***REDACTED***");
    s = s.replace(/sk-[a-z0-9]{8,}/gi, "***REDACTED***");
    return s;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Load member definition
// ---------------------------------------------------------------------------

interface MemberDef {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  toolIds: string[];
  pageAccess: string;
  allowedNodeIds: string[];
  canWrite: boolean;
}

async function loadMemberDefinition(memberId: string): Promise<MemberDef | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT id, display_name, system_prompt, model, tool_ids,
           page_access::text, allowed_node_ids, can_write
    FROM team_members
    WHERE id = ${memberId}::uuid AND kind = 'ai' AND is_active = true
  `);
  const row = rows[0] as unknown as {
    id: string; display_name: string; system_prompt: string; model: string;
    tool_ids: string[]; page_access: string; allowed_node_ids: string[];
    can_write: boolean;
  } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name,
    systemPrompt: row.system_prompt,
    model: row.model,
    toolIds: row.tool_ids || [],
    pageAccess: row.page_access || "all",
    allowedNodeIds: row.allowed_node_ids || [],
    canWrite: row.can_write,
  };
}

// ---------------------------------------------------------------------------
// Build context
// ---------------------------------------------------------------------------

async function buildContext(nodeId: string | null, ownerId: string): Promise<string> {
  const db = getDb();
  const parts: string[] = [];

  if (nodeId) {
    const rows = await db.execute(sql`
      SELECT title, search_text, properties FROM nodes WHERE id = ${nodeId}::uuid
    `);
    const r = rows[0] as unknown as {
      title: string; search_text: string; properties: Record<string, unknown>;
    } | undefined;
    if (r) {
      parts.push(
        `## Current page context\nTitle: ${r.title}\n` +
        `Content: ${(r.search_text || "").slice(0, 2000)}\n` +
        `Properties: ${JSON.stringify(r.properties || {})}`,
      );
    }
  }

  const recent = await db.execute(sql`
    SELECT title, type::text FROM nodes
    WHERE owner_id = ${ownerId}::uuid AND type IN ('page', 'database')
    ORDER BY updated_at DESC LIMIT 5
  `);
  const recentList = recent as unknown as Array<{ title: string; type: string }>;
  if (recentList.length > 0) {
    const titles = recentList.map((r) => `- [${r.type}] ${r.title}`);
    parts.push("## Recent workspace pages\n" + titles.join("\n"));
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Message persistence
// ---------------------------------------------------------------------------

async function saveMessage(
  conversationId: string, role: string, content: string,
  taskId?: string, metadata?: Record<string, unknown>,
) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO messages (conversation_id, role, content, task_id, metadata)
    VALUES (${conversationId}::uuid, ${role}::message_role, ${content},
            ${taskId || null}::uuid, ${JSON.stringify(metadata || {})}::jsonb)
  `);
}

async function loadConversationMessages(conversationId: string, limit = 50): Promise<ModelMessage[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT role::text, content FROM messages
    WHERE conversation_id = ${conversationId}::uuid
    ORDER BY created_at ASC LIMIT ${limit}
  `);
  return (rows as unknown as Array<{ role: string; content: string }>).map((r) => ({
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
  }));
}

async function loadChannelMessages(channelId: string, limit = 30): Promise<ModelMessage[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT tm.display_name AS member_name, tm.kind::text AS member_kind,
           ccm.content
    FROM chat_channel_messages ccm
    LEFT JOIN team_members tm ON tm.id = ccm.author_member_id
    WHERE ccm.channel_id = ${channelId}::uuid
    ORDER BY ccm.created_at DESC LIMIT ${limit}
  `);
  const list = rows as unknown as Array<{
    member_name: string; member_kind: string; content: string;
  }>;
  return list.reverse().map((msg) => {
    if (msg.member_kind === "ai") {
      return { role: "assistant" as const, content: msg.content };
    }
    const sender = msg.member_name || "User";
    return { role: "user" as const, content: `[${sender}]: ${msg.content}` };
  });
}

async function saveChannelMessage(channelId: string, authorMemberId: string, content: string) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO chat_channel_messages (channel_id, content, author_member_id)
    VALUES (${channelId}::uuid, ${content}, ${authorMemberId}::uuid)
  `);
}

// ---------------------------------------------------------------------------
// Main workflow
// ---------------------------------------------------------------------------

export async function runAgentWorkflow(
  taskId: string,
  nodeId: string | null,
  ownerId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const prompt = (input.prompt as string) || "";
  if (!prompt) return { error: "No prompt provided in task input." };

  const conversationId = input.conversation_id as string | undefined;
  const memberId = input.member_id as string | undefined;
  const channelId = input.channel_id as string | undefined;
  const minimalMode = Boolean(input.minimal_mode);
  const nid = nodeId || (input.node_id as string) || null;

  let systemPrompt = minimalMode ? MINIMAL_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
  let modelOverride: string | null = null;
  let toolIds: string[] | null = null;
  let canWrite = true;
  let pageAccess = "all";
  let allowedNodeIds: string[] = [];

  // Load AI member config
  if (!minimalMode && memberId) {
    const def = await loadMemberDefinition(memberId);
    if (def) {
      if (def.systemPrompt) systemPrompt = def.systemPrompt;
      if (def.model) modelOverride = def.model;
      if (def.toolIds.length > 0) toolIds = def.toolIds;
      pageAccess = def.pageAccess;
      allowedNodeIds = def.allowedNodeIds;
      canWrite = def.canWrite;
    }
  }

  // Build model
  const db = getDb();
  let llmModel;
  try {
    ({ model: llmModel } = await getModel(db, modelOverride));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // Load tools
  const tools = await loadToolsForAgent(ownerId, taskId, toolIds, minimalMode);

  // Build context
  const context = await buildContext(nid, ownerId);

  let fullSystem = systemPrompt;
  if (!canWrite) {
    fullSystem +=
      "\n\n## PERMISSION: You have READ-ONLY access. Do NOT use create_node, update_node_properties, or append_text_to_page.";
  }
  if (pageAccess === "selected" && allowedNodeIds.length > 0) {
    fullSystem += `\n\n## PERMISSION: You can only access these page IDs: ${allowedNodeIds.slice(0, 20).join(", ")}`;
  }
  if (context) fullSystem += `\n\n${context}`;

  // Build message history
  let messages: ModelMessage[] = [];
  if (channelId) {
    messages = await loadChannelMessages(channelId);
  } else if (conversationId) {
    messages = await loadConversationMessages(conversationId);
  }

  // Add current prompt (channel messages already include it)
  if (!channelId) {
    messages.push({ role: "user", content: prompt });
  }

  // Save user message to conversation
  if (conversationId && !channelId) {
    await saveMessage(conversationId, "user", prompt, taskId);
  }

  // Run the ReAct loop
  const result = await generateText({
    model: llmModel,
    system: fullSystem,
    messages,
    tools,
    stopWhen: stepCountIs(10),
  });

  // Build execution trace from steps
  const traceLog: Array<Record<string, unknown>> = [];
  let step = 0;
  const finalText = result.text || "";

  for (const s of result.steps) {
    const ts = new Date().toISOString();
    if (s.toolCalls && s.toolCalls.length > 0) {
      if (s.text) {
        step++;
        traceLog.push({ step, type: "thinking", content: redactPayload(s.text), ts });
      }
      for (const tc of s.toolCalls) {
        step++;
        traceLog.push({
          step, type: "tool_call",
          tool: tc.toolName,
          input: redactPayload(tc.input),
          ts,
        });
      }
    }
    if (s.toolResults && s.toolResults.length > 0) {
      for (const tr of s.toolResults) {
        step++;
        traceLog.push({
          step, type: "tool_result",
          tool: tr.toolName,
          output: redactPayload(typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output)),
          ts,
        });
      }
    }
  }

  // Final response
  if (finalText) {
    step++;
    traceLog.push({ step, type: "response", content: redactPayload(finalText), ts: new Date().toISOString() });
  }

  // Persist trace_log
  await db.execute(sql`
    UPDATE agent_tasks SET trace_log = ${JSON.stringify(traceLog)}::jsonb WHERE id = ${taskId}::uuid
  `);

  // Save assistant response
  if (channelId && memberId && finalText) {
    await saveChannelMessage(channelId, memberId, finalText);
  } else if (conversationId) {
    await saveMessage(conversationId, "assistant", finalText, taskId, {
      model: modelOverride || "default",
    });
  }

  // Audit log
  await db.execute(sql`
    INSERT INTO writes (task_id, table_name, row_id, operation, new_data, actor_type, actor_id)
    VALUES (${taskId}::uuid, 'agent_tasks', ${taskId}::uuid, 'UPDATE',
            ${JSON.stringify({ response: finalText.slice(0, 2000) })}::jsonb,
            'agent', ${taskId}::uuid)
  `);

  logger.info(`Agent workflow complete for task ${taskId}`);
  return { response: finalText };
}
