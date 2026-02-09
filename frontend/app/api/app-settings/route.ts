import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_KEYS = [
  "setup_complete", "llm_provider", "llm_model", "llm_api_base",
  "llm_api_key", "llm_configured",
  "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from_email",
] as const;

// GET /api/app-settings — public (for setup_complete check before auth)
export async function GET() {
  try {
    const rows = await db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.isSecret, false));

    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return NextResponse.json(map);
  } catch (e) {
    console.error("App settings GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const settingSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string(),
  is_secret: z.boolean().optional(),
});

const upsertSchema = z.array(settingSchema).min(1).max(20);

// PUT /api/app-settings — requires auth, bulk upsert
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Bulk upsert via INSERT ... ON CONFLICT
    for (const setting of parsed.data) {
      await db
        .insert(appSettings)
        .values({
          key: setting.key,
          value: setting.value,
          isSecret: setting.is_secret ?? false,
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: sql`excluded.value`,
            isSecret: sql`excluded.is_secret`,
          },
        });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("App settings PUT error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
