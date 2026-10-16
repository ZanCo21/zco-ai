import { NextRequest } from "next/server";
import {
  extractUploadedFile,
  PipelineError,
  readUploadedFile,
} from "@/lib/document-pipeline";
import { ndjsonResponse } from "@/lib/ndjson-response";
import type { StudyMaterial } from "@/lib/study-summary";

function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || name;
}

/**
 * POST /api/study/extract (multipart `file`) -> NDJSON progress events.
 * Same extraction pipeline as Knowledge uploads, but nothing is stored: the
 * study material is not added to the chat knowledge base.
 */
export async function POST(req: NextRequest) {
  return ndjsonResponse(async (send) => {
    try {
      const formData = await req.formData();
      const doc = await readUploadedFile(formData.get("file"));
      send({ type: "stage", stage: "upload", status: "completed" });

      send({ type: "stage", stage: "extract", status: "started" });
      const converted = await extractUploadedFile(doc);
      if (!converted.markdown.trim()) {
        throw new PipelineError("No text could be extracted from this file.", "extract", 422);
      }
      send({ type: "stage", stage: "extract", status: "completed" });

      const material: StudyMaterial = {
        title: titleFromFilename(doc.file.name),
        filename: doc.file.name,
        fileSize: doc.file.size,
        pageCount: converted.pageCount,
        wordCount: converted.wordCount,
        language: converted.language,
        text: converted.markdown,
      };
      send({ type: "result", data: material });
    } catch (error) {
      console.error("POST /api/study/extract error:", error);
      send({
        type: "error",
        stage: error instanceof PipelineError ? error.stage : "upload",
        message: error instanceof Error ? error.message : "Extraction failed",
      });
    }
  });
}
