/**
 * Triage workflow: classify content, extract entities/dates, create linked child nodes.
 * Port of backend/graph/workflows/triage.py — no graph framework needed.
 */

import { generateText } from "ai";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getModel } from "../llm";
import { withActor } from "../with-actor";
import { logger } from "../logger";

const LLM_MAX_INPUT_CHARS = parseInt(process.env.LLM_MAX_INPUT_CHARS || "4000", 10);

export async function runTriageWorkflow(
  taskId: string,
  nodeId: string | null,
  ownerId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const nid = nodeId || (input.node_id as string) || "";
  if (!nid) return { error: "No node_id provided" };

  const db = getDb();

  let llmModel;
  try {
    ({ model: llmModel } = await getModel(db));
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // Step 1: Fetch
  const rows = await db.execute(sql`
    SELECT title, search_text FROM nodes WHERE id = ${nid}::uuid
  `);
  const row = rows[0] as unknown as { title: string; search_text: string } | undefined;
  if (!row) return { error: "Node not found" };

  const text = (row.search_text || row.title || "").slice(0, LLM_MAX_INPUT_CHARS);
  if (!text.trim()) {
    return { classification: "note", entities: [], dates: [], created_node_ids: [] };
  }

  // Step 2: Classify
  const { text: rawClassification } = await generateText({
    model: llmModel,
    system:
      "Classify the following content into exactly one category: " +
      "task, note, reference, or spam. " +
      "Respond with ONLY the category word, nothing else.",
    prompt: text,
  });

  let classification = (rawClassification || "note").trim().toLowerCase();
  if (!["task", "note", "reference", "spam"].includes(classification)) {
    classification = "note";
  }

  // Step 3: Extract entities and dates
  const { text: rawExtraction } = await generateText({
    model: llmModel,
    system:
      'Extract entities and dates from the text. Return JSON with two keys: ' +
      '"entities" (array of {"name": str, "type": "person"|"org"}) ' +
      'and "dates" (array of date strings in YYYY-MM-DD format). ' +
      "Return only valid JSON.",
    prompt: text,
  });

  let extractedEntities: Array<{ name: string; type: string }> = [];
  let extractedDates: string[] = [];
  try {
    const parsed = JSON.parse(rawExtraction || "{}");
    extractedEntities = Array.isArray(parsed.entities) ? parsed.entities : [];
    extractedDates = Array.isArray(parsed.dates) ? parsed.dates : [];
  } catch {
    // LLM returned invalid JSON — proceed with empty extractions
  }

  // Step 4: Create linked nodes in one transaction
  const createdNodeIds: string[] = [];

  await withActor("agent", taskId, async (tx) => {
    // If classified as task, create a task node
    if (classification === "task") {
      const taskRows = await tx.execute(sql`
        INSERT INTO nodes (owner_id, parent_id, type, title, properties)
        VALUES (${ownerId}::uuid, ${nid}::uuid, 'page', 'Extracted Task',
                ${JSON.stringify({
                  source: "triage",
                  classification,
                  dates: extractedDates,
                })}::jsonb)
        RETURNING id
      `);
      const r = taskRows[0] as unknown as { id: string } | undefined;
      if (r) createdNodeIds.push(r.id);
    }

    // Create entity reference nodes
    for (const entity of extractedEntities) {
      const name = entity.name || "Unknown";
      const entRows = await tx.execute(sql`
        INSERT INTO nodes (owner_id, parent_id, type, title, properties)
        VALUES (${ownerId}::uuid, ${nid}::uuid, 'page', ${`Reference: ${name}`},
                ${JSON.stringify({
                  source: "triage",
                  entity_name: name,
                  entity_type: entity.type || "person",
                })}::jsonb)
        RETURNING id
      `);
      const r = entRows[0] as unknown as { id: string } | undefined;
      if (r) {
        createdNodeIds.push(r.id);
        // Create MENTIONS edge
        await tx.execute(sql`
          INSERT INTO edges (source_id, target_id, type)
          VALUES (${nid}::uuid, ${r.id}::uuid, 'MENTIONS')
          ON CONFLICT (source_id, target_id, type) DO NOTHING
        `);
      }
    }

    // Audit log for created nodes
    for (const cid of createdNodeIds) {
      await tx.execute(sql`
        INSERT INTO writes (task_id, table_name, row_id, operation, new_data)
        VALUES (${taskId}::uuid, 'nodes', ${cid}::uuid, 'INSERT', '{"source":"triage"}'::jsonb)
      `);
    }

    // Update original node with triage results
    await tx.execute(sql`
      UPDATE nodes
      SET properties = properties || ${JSON.stringify({
        ai_classification: classification,
        ai_entities: extractedEntities,
        ai_dates: extractedDates,
      })}::jsonb,
          updated_at = now()
      WHERE id = ${nid}::uuid
    `);
  });

  logger.info(`Triage complete for node ${nid}: ${classification}`);
  return {
    classification,
    entities: extractedEntities,
    dates: extractedDates,
    created_node_ids: createdNodeIds,
  };
}
