/**
 * Upload validation + document extraction shared by Knowledge uploads and
 * Study Mode. Extraction itself is done by the Python worker (/convert);
 * this module only stages the temp file and maps failures to clear errors.
 */

import { randomUUID } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { callWorkerConvert, type ConvertResult } from "@/lib/ai";
import {
  fileExtension,
  isTextExtension,
  validateUploadFile,
} from "@/lib/upload-constraints";

/** A failure in a named pipeline stage, with the HTTP status to report. */
export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export interface UploadedDocument {
  file: File;
  ext: string;
  buffer: Buffer;
}

/** Validate the multipart `file` field (type allow-list, size limit). */
export async function readUploadedFile(value: FormDataEntryValue | null): Promise<UploadedDocument> {
  if (!(value instanceof File)) {
    throw new PipelineError("No file was received.", "upload", 400);
  }
  const problem = validateUploadFile(value);
  if (problem) {
    const status = problem.startsWith("Unsupported") ? 415 : value.size === 0 ? 400 : 413;
    throw new PipelineError(problem, "upload", status);
  }
  return {
    file: value,
    ext: fileExtension(value.name),
    buffer: Buffer.from(await value.arrayBuffer()),
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Convert the document to Markdown through the worker. Plain-text formats fall
 * back to the raw bytes when the worker is unavailable; binary formats fail
 * loudly instead of storing unreadable content.
 */
export async function extractUploadedFile(doc: UploadedDocument): Promise<ConvertResult> {
  // The temp file MUST keep the real extension: extractors pick the parser
  // (pdfplumber vs MarkItDown) from it. Name is random, never user-controlled.
  const tempFilePath = join(tmpdir(), `${randomUUID()}${doc.ext}`);
  await writeFile(tempFilePath, doc.buffer);
  try {
    return await callWorkerConvert(tempFilePath, doc.file.name);
  } catch (workerError) {
    if (!isTextExtension(doc.ext)) {
      console.error("Python worker failed for binary upload:", workerError);
      const reason = workerError instanceof Error ? workerError.message : String(workerError);
      const unreachable = /fetch failed|ECONNREFUSED/i.test(reason);
      throw new PipelineError(
        unreachable
          ? "The document processing service (Python worker) is not reachable. Start it and try again."
          : `Text could not be extracted from this file. ${reason.replace(/^Worker \/convert failed: /, "")}`,
        "extract",
        502
      );
    }
    console.warn("Python worker unavailable, using text fallback:", workerError);
    const markdown = doc.buffer.toString("utf-8");
    return { markdown, pageCount: null, wordCount: countWords(markdown), language: null };
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // ignore
    }
  }
}
