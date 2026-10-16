import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge } from "@/db/schema";
import { randomUUID } from "crypto";
import { callWorkerProcess, type WorkerChunk } from "@/lib/ai";
import type { KnowledgeMetadata } from "@/lib/knowledge-metadata";
import { insertChunks, singleChunk } from "@/lib/knowledge-store";

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content required" },
        { status: 400 }
      );
    }

    // Process content into chunks
    let chunks: WorkerChunk[] = [];
    let metadata: KnowledgeMetadata | null = null;
    try {
      const processResult = await callWorkerProcess(content);
      chunks = processResult.chunks;
      metadata = {
        wordCount: processResult.word_count,
        language: processResult.language ?? null,
      };
    } catch (workerError) {
      console.warn("Python worker unavailable, using fallback:", workerError);
      chunks = singleChunk(content);
    }

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No chunks generated from content" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date();

    db.transaction((tx) => {
      tx.insert(knowledge)
        .values({
          id,
          title,
          content,
          sourceType: "text",
          metadata: metadata ? JSON.stringify(metadata) : null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertChunks(tx, id, chunks, now);
    });

    return NextResponse.json({
      id,
      title,
      content,
      chunksCreated: chunks.length,
    });
  } catch (error) {
    console.error("POST /api/knowledge error:", error);
    return NextResponse.json(
      { error: "Failed to create knowledge" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const items = await db.select().from(knowledge).all();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/knowledge error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}
