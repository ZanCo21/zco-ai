import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { randomUUID } from "crypto";
import { callWorkerProcess } from "@/lib/ai";

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
    let chunks: Array<{ chunk_index: number; content: string; word_count: number }> = [];
    try {
      const processResult = await callWorkerProcess(content);
      chunks = processResult.chunks;
    } catch (workerError) {
      console.warn("Python worker unavailable, using fallback:", workerError);
      chunks = [
        {
          chunk_index: 0,
          content,
          word_count: content.split(/\s+/).filter(Boolean).length || 1,
        },
      ];
    }

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No chunks generated from content" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date();

    await db.insert(knowledge).values({
      id,
      title,
      content,
      sourceType: "text",
      createdAt: now,
      updatedAt: now,
    });

    // Save chunks
    for (const chunk of chunks) {
      await db.insert(knowledgeChunk).values({
        id: randomUUID(),
        knowledgeId: id,
        chunkIndex: chunk.chunk_index,
        content: chunk.content,
        wordCount: chunk.word_count,
        createdAt: now,
      });
    }

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
