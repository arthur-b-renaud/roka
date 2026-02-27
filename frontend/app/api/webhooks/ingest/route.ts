/**
 * POST /api/webhooks/ingest — inbound webhook handler.
 * Moved from Python backend/app/routes/webhooks.py.
 *
 * Authenticates via X-Roka-Webhook-Secret header (not session-based).
 * Resolves/creates entity, persists communication, optionally auto-triages.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const webhookPayloadSchema = z.object({
  channel: z.string().default("webhook"),
  direction: z.string().default("inbound"),
  from_email: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  content_text: z.string().nullable().optional(),
  raw_payload: z.record(z.unknown()).default({}),
  auto_triage: z.boolean().default(true),
});

function verifySecret(req: Request): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return true; // no secret configured = open
  const provided = req.headers.get("x-roka-webhook-secret") || "";
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(provided.padEnd(expected.length, "\0").slice(0, expected.length)),
  );
}

export async function POST(req: Request) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof webhookPayloadSchema>;
  try {
    const raw = await req.json();
    const result = webhookPayloadSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }
    body = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let entityId: string | null = null;

  // Entity resolution
  if (body.from_email) {
    const existing = await db.execute(sql`
      SELECT id FROM entities
      WHERE resolution_keys @> ${JSON.stringify([body.from_email])}::jsonb
      LIMIT 1
    `);
    const row = existing[0] as unknown as { id: string } | undefined;
    if (row) {
      entityId = row.id;
    } else {
      const inserted = await db.execute(sql`
        INSERT INTO entities (display_name, type, resolution_keys)
        VALUES (${body.from_email}, 'person', ${JSON.stringify([body.from_email])}::jsonb)
        RETURNING id
      `);
      const r = inserted[0] as unknown as { id: string } | undefined;
      entityId = r?.id ?? null;
    }
  }

  // Persist communication
  const commRows = await db.execute(sql`
    INSERT INTO communications
    (channel, direction, from_entity_id, subject, content_text, raw_payload)
    VALUES (${body.channel}::comm_channel, ${body.direction}::comm_direction,
            ${entityId}::uuid, ${body.subject ?? null}, ${body.content_text ?? null},
            ${JSON.stringify(body.raw_payload)}::jsonb)
    RETURNING id
  `);
  const commId = (commRows[0] as unknown as { id: string })?.id;

  // Auto-triage
  let taskId: string | null = null;
  if (body.auto_triage && body.direction === "inbound") {
    const ownerRows = await db.execute(sql`
      SELECT owner_id FROM nodes LIMIT 1
    `);
    const owner = ownerRows[0] as unknown as { owner_id: string } | undefined;
    if (owner) {
      const triagePrompt = [
        `New inbound webhook received.`,
        body.from_email ? `From: ${body.from_email}` : "",
        body.subject ? `Subject: ${body.subject}` : "",
        body.content_text ? `Content: ${body.content_text.slice(0, 2000)}` : "",
        `Please triage this communication and take appropriate action.`,
      ].filter(Boolean).join("\n");

      const taskRows = await db.execute(sql`
        INSERT INTO agent_tasks (owner_id, workflow, input)
        VALUES (${owner.owner_id}::uuid, 'agent',
                ${JSON.stringify({ prompt: triagePrompt })}::jsonb)
        RETURNING id
      `);
      taskId = (taskRows[0] as unknown as { id: string })?.id ?? null;
    }
  }

  return NextResponse.json({
    status: "received",
    entity_id: entityId,
    communication_id: commId,
    task_id: taskId,
  });
}
