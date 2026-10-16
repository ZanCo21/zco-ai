import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledge } from "@/db/schema";
import { parseJsonObject, type KnowledgeMetadata } from "@/lib/knowledge-metadata";
import { storedFilePath } from "@/lib/knowledge-store";

/**
 * GET /api/knowledge/:id/file — the original upload, for the document preview.
 * The path is resolved server-side from our own stored name, never from user
 * input. Only PDFs are served inline; everything else is a download, so an
 * uploaded HTML file can never run in the app's origin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db
    .select({
      metadata: knowledge.metadata,
      originalFilename: knowledge.originalFilename,
    })
    .from(knowledge)
    .where(eq(knowledge.id, id))
    .get();

  const filePath = storedFilePath(
    item ? parseJsonObject<KnowledgeMetadata>(item.metadata).storedFile : null
  );
  if (!item || !filePath) {
    return NextResponse.json({ error: "Original file not available" }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Original file not available" }, { status: 404 });
  }

  const isPdf = filePath.endsWith(".pdf");
  const filename = encodeURIComponent(item.originalFilename || `document${isPdf ? ".pdf" : ""}`);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${isPdf ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
