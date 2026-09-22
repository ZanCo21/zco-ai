import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { callWorkerConvert, callWorkerProcess } from "@/lib/ai";

export async function POST(req: NextRequest) {
  let tempFilePath = "";

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const title = (formData.get("title") as string) || file.name;

    if (!file) {
      return NextResponse.json(
        { error: "file required" },
        { status: 400 }
      );
    }

    // Save file temporarily
    const buffer = await file.arrayBuffer();
    tempFilePath = join(tmpdir(), randomUUID());
    await writeFile(tempFilePath, Buffer.from(buffer));

    // Convert to Markdown
    const markdown = await callWorkerConvert(tempFilePath);

    // Process (clean + chunk)
    const processResult = await callWorkerProcess(markdown);
    const chunks = processResult.chunks;

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No chunks generated from file" },
        { status: 400 }
      );
    }

    // Save to database
    const knowledgeId = randomUUID();
    const now = new Date();

    await db.insert(knowledge).values({
      id: knowledgeId,
      title,
      content: markdown,
      sourceType: "file",
      originalFilename: file.name,
      mimeType: file.type,
      createdAt: now,
      updatedAt: now,
    });

    // Save chunks
    for (const chunk of chunks) {
      await db.insert(knowledgeChunk).values({
        id: randomUUID(),
        knowledgeId,
        chunkIndex: chunk.chunk_index,
        content: chunk.content,
        wordCount: chunk.word_count,
        createdAt: now,
      });
    }

    return NextResponse.json({
      id: knowledgeId,
      title,
      filename: file.name,
      chunksCreated: chunks.length,
    });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {
        // ignore
      }
    }
  }
}
