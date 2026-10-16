/**
 * File -> knowledge ingestion pipeline (upload -> extract -> process -> ready).
 * `onStage` is called when each step really starts/finishes, which is what the
 * Add Knowledge progress stepper displays.
 */

import { randomUUID } from "crypto";
import { db } from "@/db";
import { knowledge } from "@/db/schema";
import { callWorkerProcess, type WorkerChunk } from "@/lib/ai";
import {
  extractUploadedFile,
  PipelineError,
  type UploadedDocument,
} from "@/lib/document-pipeline";
import type { KnowledgeMetadata } from "@/lib/knowledge-metadata";
import {
  insertChunks,
  removeOriginalFile,
  saveOriginalFile,
  singleChunk,
} from "@/lib/knowledge-store";
import type { KnowledgeStage, StageStatus } from "@/lib/processing-events";
import { isTextExtension } from "@/lib/upload-constraints";

export interface IngestResult {
  id: string;
  title: string;
  filename: string;
  chunksCreated: number;
  wordCount: number;
}

export async function ingestKnowledgeFile(
  doc: UploadedDocument,
  title: string,
  onStage: (stage: KnowledgeStage, status: StageStatus) => void = () => {},
  signal?: AbortSignal
): Promise<IngestResult> {
  onStage("upload", "completed");

  onStage("extract", "started");
  const converted = await extractUploadedFile(doc);
  if (!converted.markdown.trim()) {
    throw new PipelineError("No text could be extracted from this file.", "extract", 422);
  }
  onStage("extract", "completed");

  onStage("process", "started");
  let chunks: WorkerChunk[];
  try {
    chunks = (await callWorkerProcess(converted.markdown)).chunks;
  } catch (workerError) {
    if (!isTextExtension(doc.ext)) {
      console.error("Python worker failed to chunk binary upload:", workerError);
      throw new PipelineError(
        "The extracted text could not be split into knowledge chunks. Check that the Python worker is running.",
        "process",
        502
      );
    }
    console.warn("Python worker unavailable, using single chunk:", workerError);
    chunks = singleChunk(converted.markdown);
  }
  if (chunks.length === 0) {
    throw new PipelineError("No knowledge chunks were generated from this file.", "process", 422);
  }

  // The user cancelled while we were working: do not create the entry.
  if (signal?.aborted) {
    throw new PipelineError("Upload cancelled.", "process", 499);
  }

  const knowledgeId = randomUUID();
  const now = new Date();
  let storedFile: string | null = null;
  try {
    storedFile = await saveOriginalFile(knowledgeId, doc.ext, doc.buffer);
  } catch (error) {
    // Preview becomes unavailable, the knowledge itself is still usable.
    console.warn("Could not keep original upload:", error);
  }

  const metadata: KnowledgeMetadata = {
    fileSize: doc.file.size,
    pageCount: converted.pageCount,
    wordCount: converted.wordCount,
    language: converted.language,
    storedFile,
  };

  try {
    db.transaction((tx) => {
      tx.insert(knowledge)
        .values({
          id: knowledgeId,
          title,
          content: converted.markdown,
          sourceType: "file",
          originalFilename: doc.file.name,
          mimeType: doc.file.type,
          metadata: JSON.stringify(metadata),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertChunks(tx, knowledgeId, chunks, now);
    });
  } catch (error) {
    await removeOriginalFile(storedFile);
    console.error("Saving knowledge failed:", error);
    throw new PipelineError("The knowledge could not be saved to the database.", "process", 500);
  }
  onStage("process", "completed");

  // Retrieval reads chunks straight from the database (TF-IDF is fitted per
  // query), so a committed entry is immediately usable in chat.
  onStage("ready", "completed");

  return {
    id: knowledgeId,
    title,
    filename: doc.file.name,
    chunksCreated: chunks.length,
    wordCount: converted.wordCount,
  };
}
