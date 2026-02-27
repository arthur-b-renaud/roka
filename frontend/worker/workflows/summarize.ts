/**
 * Summarize workflow: fetch node content -> LLM summarize -> write to node properties.
 * Port of backend/graph/workflows/summarize.py — no graph framework needed.
 */

import { generateText } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getModel } from "../llm";
import { withActor } from "../with-actor";
import { logger } from "../logger";

const LLM_MAX_INPUT_CHARS = parseInt(process.env.LLM_MAX_INPUT_CHARS || "4000", 10);

export async function runSummarizeWorkflow(
  taskId: string,
  nodeId: string | null,
  ownerId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const nid = nodeId || (input.node_id as string) || "";
  if (!nid) return { error: "No node_id provided" };

  const db = getDb();

  // Step 1: Fetch node content
  const rows = await db.execute(sql`
    SELECT title, search_text FROM nodes WHERE id = ${nid}::uuid
  `);
  const row = rows[0] as unknown as { title: string; search_text: string } | undefined;
  if (!row) return { error: "Node not found" };

  const text = row.search_text || row.title || "";
  if (!text.trim()) return { summary: "No content to summarize." };

  // Step 2: LLM call
  let llmModel;
  try {
    ({ model: llmModel } = await getModel(db));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const { text: summary } = await generateText({
    model: llmModel,
    system:
      "You are a concise summarizer. Summarize the following content in 2-3 sentences.",
    prompt: text.slice(0, LLM_MAX_INPUT_CHARS),
  });

  const finalSummary = summary || "Could not generate summary.";

  // Step 3: Write summary + audit log in one transaction
  await withActor("agent", taskId, async (tx) => {
    await tx.execute(sql`
      UPDATE nodes
      SET properties = properties || jsonb_build_object('ai_summary', ${finalSummary}::text),
          updated_at = now()
      WHERE id = ${nid}::uuid
    `);

    await tx.execute(sql`
      INSERT INTO writes (task_id, table_name, row_id, operation, new_data)
      VALUES (${taskId}::uuid, 'nodes', ${nid}::uuid, 'UPDATE',
              ${JSON.stringify({ ai_summary: finalSummary })}::jsonb)
    `);
  });

  logger.info(`Summarize complete for node ${nid}`);
  return { summary: finalSummary };
}
