import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { callWorkerProcess } from "@/lib/ai";

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
    let newChunks: Array<{ chunk_index: number; content: string; word_count: number }> | null = null;
    if (content !== undefined) {
      try {
        newChunks = (await callWorkerProcess(content)).chunks;
      } catch (workerError) {
        console.warn("Python worker unavailable, using single chunk:", workerError);
        newChunks = [
          {
            chunk_index: 0,
            content,
            word_count: content.split(/\s+/).filter(Boolean).length || 1,
          },
        ];
      }
    }

    db.transaction((tx) => {
      tx.update(knowledge).set(updateData).where(eq(knowledge.id, id)).run();
      if (newChunks) {
        const now = new Date();
        tx.delete(knowledgeChunk).where(eq(knowledgeChunk.knowledgeId, id)).run();
        for (const chunk of newChunks) {
          tx.insert(knowledgeChunk)
            .values({
              id: randomUUID(),
              knowledgeId: id,
              chunkIndex: chunk.chunk_index,
              content: chunk.content,
              wordCount: chunk.word_count,
              createdAt: now,
            })
            .run();
        }
      }
    });

    return NextResponse.json({ id, title, content });
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

    // Cascade delete via schema foreign key
    await db.delete(knowledge).where(eq(knowledge.id, id));

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("DELETE /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge" },
      { status: 500 }
    );
  }
}
