import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { extname, join } from "path";
import { tmpdir } from "os";
import { callWorkerConvert, callWorkerProcess } from "@/lib/ai";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".xls"]);
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
]);

export async function POST(req: NextRequest) {
  let tempFilePath = "";

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const ext = extname(file.name).toLowerCase();
    if (!BINARY_EXTENSIONS.has(ext) && !TEXT_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext || "(none)"}` },
        { status: 415 }
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is empty or larger than 25 MB" },
        { status: 413 }
      );
    }

    const title = (formData.get("title") as string) || file.name;

    // The temp file MUST keep the real extension: extractors pick the parser
    // (pdfplumber vs MarkItDown) from it. Name is random, never user-controlled.
    const buffer = Buffer.from(await file.arrayBuffer());
    tempFilePath = join(tmpdir(), `${randomUUID()}${ext}`);
    await writeFile(tempFilePath, buffer);

    // Convert to Markdown & chunk
    let markdown = "";
    let chunks: Array<{
      chunk_index: number;
      content: string;
      word_count: number;
    }> = [];

    try {
      markdown = await callWorkerConvert(tempFilePath, file.name);
      chunks = (await callWorkerProcess(markdown)).chunks;
    } catch (workerError) {
      // Binary formats cannot be read without the worker: fail loudly instead
      // of storing garbage ("Document: name.pdf") that can never be retrieved.
      if (!TEXT_EXTENSIONS.has(ext)) {
        console.error("Python worker failed for binary upload:", workerError);
        return NextResponse.json(
          {
            error:
              workerError instanceof Error
                ? workerError.message
                : "Document processing failed",
          },
          { status: 502 }
        );
      }
      console.warn("Python worker unavailable, using text fallback:", workerError);
      markdown = buffer.toString("utf-8");
      chunks = [
        {
          chunk_index: 0,
          content: markdown,
          word_count: markdown.split(/\s+/).filter(Boolean).length || 1,
        },
      ];
    }

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No chunks generated from file" },
        { status: 400 }
      );
    }

    const knowledgeId = randomUUID();
    const now = new Date();

    db.transaction((tx) => {
      tx.insert(knowledge)
        .values({
          id: knowledgeId,
          title,
          content: markdown,
          sourceType: "file",
          originalFilename: file.name,
          mimeType: file.type,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      for (const chunk of chunks) {
        tx.insert(knowledgeChunk)
          .values({
            id: randomUUID(),
            knowledgeId,
            chunkIndex: chunk.chunk_index,
            content: chunk.content,
            wordCount: chunk.word_count,
            createdAt: now,
          })
          .run();
      }
    });

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
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {
        // ignore
      }
    }
  }
}
