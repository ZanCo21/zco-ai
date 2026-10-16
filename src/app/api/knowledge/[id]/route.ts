import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { callWorkerProcess, type WorkerChunk } from "@/lib/ai";
import { parseJsonObject, type KnowledgeMetadata } from "@/lib/knowledge-metadata";
import { insertChunks, removeOriginalFile, singleChunk } from "@/lib/knowledge-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const item = await db
      .select()
      .from(knowledge)
      .where(eq(knowledge.id, id))
      .get();

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const chunks = await db
      .select()
      .from(knowledgeChunk)
      .where(eq(knowledgeChunk.knowledgeId, id))
      .orderBy(asc(knowledgeChunk.chunkIndex))
      .all();

    return NextResponse.json({ ...item, chunks });
  } catch (error) {
    console.error("GET /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, content, originalFilename, mimeType, sourceType } = body;

    const existing = await db
      .select({ metadata: knowledge.metadata })
      .from(knowledge)
      .where(eq(knowledge.id, id))
      .get();
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      title,
      updatedAt: new Date(),
    };
    if (content !== undefined) updateData.content = content;
    if (originalFilename !== undefined) updateData.originalFilename = originalFilename;
    if (mimeType !== undefined) updateData.mimeType = mimeType;
    if (sourceType !== undefined) updateData.sourceType = sourceType;

    // Edited content must be re-chunked, otherwise retrieval keeps serving the
    // stale chunks of the previous version. Chunk first (may throw) so a worker
    // failure leaves the record untouched.
    let newChunks: WorkerChunk[] | null = null;
    if (content !== undefined) {
      const metadata = parseJsonObject<KnowledgeMetadata>(existing.metadata);
      try {
        const processed = await callWorkerProcess(content);
        newChunks = processed.chunks;
        metadata.wordCount = processed.word_count;
        metadata.language = processed.language ?? metadata.language ?? null;
      } catch (workerError) {
        console.warn("Python worker unavailable, using single chunk:", workerError);
        newChunks = singleChunk(content);
        metadata.wordCount = newChunks[0].word_count;
      }
      updateData.metadata = JSON.stringify(metadata);
    }

    db.transaction((tx) => {
      tx.update(knowledge).set(updateData).where(eq(knowledge.id, id)).run();
      if (newChunks) {
        tx.delete(knowledgeChunk).where(eq(knowledgeChunk.knowledgeId, id)).run();
        insertChunks(tx, id, newChunks, new Date());
      }
    });

    return NextResponse.json({
      id,
      title,
      content,
      chunksCreated: newChunks?.length,
    });
  } catch (error) {
    console.error("PUT /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update knowledge" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db
      .select({ metadata: knowledge.metadata })
      .from(knowledge)
      .where(eq(knowledge.id, id))
      .get();

    // Cascade delete via schema foreign key
    await db.delete(knowledge).where(eq(knowledge.id, id));

    if (existing) {
      await removeOriginalFile(
        parseJsonObject<KnowledgeMetadata>(existing.metadata).storedFile
      );
    }

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("DELETE /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge" },
      { status: 500 }
    );
  }
}
