import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { getPresignedUrl } from "@/lib/s3";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
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

  const presignedUrl = await getPresignedUrl(file.s3Key, 900); // 15 min
  return NextResponse.redirect(presignedUrl, {
    status: 302,
    headers: {
      "Cache-Control": "private, max-age=300",
    },
  });
}
