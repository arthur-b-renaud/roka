import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { putObject } from "@/lib/s3";
import { NextResponse } from "next/server";

const MAX_UPLOAD_BYTES = parseInt(
  process.env.MAX_UPLOAD_BYTES ?? "26214400",
  10
); // 25MB default

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const nodeIdRaw = formData.get("nodeId");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file" },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max size: ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` },
        { status: 413 }
      );
    }

    const nodeId =
      typeof nodeIdRaw === "string" && nodeIdRaw.length > 0 ? nodeIdRaw : null;

    const fileId = crypto.randomUUID();
    const originalName = file.name;
    const mimeType = file.type || "application/octet-stream";
    const s3Key = `${userId}/${fileId}/${originalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await putObject(s3Key, buffer, mimeType);

    const [inserted] = await db
      .insert(files)
      .values({
        id: fileId,
        ownerId: userId,
        nodeId,
        name: originalName,
        mimeType,
        sizeBytes: file.size,
        s3Key,
      })
      .returning();

    if (!inserted) throw new Error("Insert failed");

    const url = `/api/files/${inserted.id}/content`;
    return NextResponse.json({ id: inserted.id, name: originalName, url });
  } catch (e) {
    console.error("File upload error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
