import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

// GET /api/app-settings — public (for setup_complete check before auth)
export async function GET() {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.isSecret, false));

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return NextResponse.json(map);
}

const upsertSchema = z.array(
  z.object({
    key: z.string(),
    value: z.string(),
    is_secret: z.boolean().optional(),
  }),
);

// PUT /api/app-settings — requires auth
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  for (const setting of parsed.data) {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, setting.key)).limit(1);
    if (existing.length > 0) {
      await db.update(appSettings).set({
        value: setting.value,
        isSecret: setting.is_secret ?? false,
      }).where(eq(appSettings.key, setting.key));
    } else {
      await db.insert(appSettings).values({
        key: setting.key,
        value: setting.value,
        isSecret: setting.is_secret ?? false,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
