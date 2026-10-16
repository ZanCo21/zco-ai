/**
 * Persistence helpers shared by the knowledge routes: chunk rows (with their
 * section metadata) and the original uploaded file under data/uploads.
 */

import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { knowledgeChunk } from "@/db/schema";
import type { WorkerChunk } from "@/lib/ai";
import type { ChunkMetadata } from "@/lib/knowledge-metadata";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Synchronous (better-sqlite3) insert of chunk rows inside a transaction. */
export function insertChunks(tx: Tx, knowledgeId: string, chunks: WorkerChunk[], now: Date) {
  for (const chunk of chunks) {
    const metadata: ChunkMetadata = chunk.section ? { section: chunk.section } : {};
    tx.insert(knowledgeChunk)
      .values({
        id: randomUUID(),
        knowledgeId,
        chunkIndex: chunk.chunk_index,
        content: chunk.content,
        wordCount: chunk.word_count,
        metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
        createdAt: now,
      })
      .run();
  }
}

/** Fallback when the worker cannot chunk: the whole text as one chunk. */
export function singleChunk(content: string): WorkerChunk[] {
  return [
    {
      chunk_index: 0,
      content,
      word_count: content.split(/\s+/).filter(Boolean).length || 1,
    },
  ];
}

// Statically scoped (CLAUDE.md §15) so the bundler does not trace the whole project.
export const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

// Only names we generated ourselves (`<uuid><ext>`) are ever touched.
const STORED_NAME_RE = /^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/;

export function storedFilePath(storedFile: string | null | undefined): string | null {
  if (!storedFile || !STORED_NAME_RE.test(storedFile)) return null;
  return path.join(UPLOADS_DIR, storedFile);
}

/** Keep the original upload for the document preview. Returns its stored name. */
export async function saveOriginalFile(knowledgeId: string, ext: string, buffer: Buffer) {
  const storedFile = `${knowledgeId}${ext}`;
  const target = storedFilePath(storedFile);
  if (!target) return null;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(target, buffer);
  return storedFile;
}

export async function removeOriginalFile(storedFile: string | null | undefined) {
  const target = storedFilePath(storedFile);
  if (!target) return;
  try {
    await unlink(target);
  } catch {
    // already gone
  }
}
