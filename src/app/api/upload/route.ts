import { NextRequest, NextResponse } from "next/server";
import { PipelineError, readUploadedFile } from "@/lib/document-pipeline";
import { ingestKnowledgeFile } from "@/lib/knowledge-ingest";
import { ndjsonResponse } from "@/lib/ndjson-response";

/**
 * POST /api/upload            -> JSON result (used by the edit dialog)
 * POST /api/upload?stream=1   -> NDJSON progress events (Add Knowledge stepper):
 *   {"type":"stage","stage":"extract","status":"started"} ... then a
 *   {"type":"result",...} or {"type":"error","stage":...,"message":...} line.
 */
export async function POST(req: NextRequest) {
  const stream = req.nextUrl.searchParams.get("stream") === "1";

  if (stream) {
    return ndjsonResponse(async (send) => {
      try {
        const formData = await req.formData();
        const doc = await readUploadedFile(formData.get("file"));
        const title = String(formData.get("title") || "").trim() || doc.file.name;
        const result = await ingestKnowledgeFile(
          doc,
          title,
          (stage, status) => send({ type: "stage", stage, status }),
          req.signal
        );
        send({ type: "result", data: result });
      } catch (error) {
        console.error("POST /api/upload (stream) error:", error);
        send({
          type: "error",
          stage: error instanceof PipelineError ? error.stage : "upload",
          message: error instanceof Error ? error.message : "Upload failed",
        });
      }
    });
  }

  try {
    const formData = await req.formData();
    const doc = await readUploadedFile(formData.get("file"));
    const title = String(formData.get("title") || "").trim() || doc.file.name;
    const result = await ingestKnowledgeFile(doc, title, undefined, req.signal);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: error instanceof PipelineError ? error.status : 500 }
    );
  }
}
