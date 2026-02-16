import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { deleteObject } from "@/lib/s3";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = ctx.params;

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.ownerId, session.user.id)))
    .limit(1);

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    await deleteObject(file.s3Key);
  } catch (e) {
    console.error("S3 delete error (continuing with DB delete):", e);
  }

  await db.delete(files).where(eq(files.id, id));
  return NextResponse.json({ ok: true });
}
