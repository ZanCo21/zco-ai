import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PipelineError } from "@/lib/document-pipeline";
import { ndjsonResponse } from "@/lib/ndjson-response";
import { summarizeMaterial } from "@/lib/study";

const summaryRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1, "The material has no text").max(2_000_000),
  language: z.string().max(10).nullish(),
});

/** POST /api/study/summary {title, text, language} -> NDJSON progress + summary. */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof summaryRequestSchema>;
  try {
    const parsed = summaryRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return ndjsonResponse(async (send) => {
    try {
      const result = await summarizeMaterial({
        ...body,
        signal: req.signal,
        onStage: (stage, status, progress) =>
          send({ type: "stage", stage, status, ...progress }),
      });
      send({ type: "result", data: result });
    } catch (error) {
      console.error("POST /api/study/summary error:", error);
      send({
        type: "error",
        stage: error instanceof PipelineError ? error.stage : "compose",
        message: error instanceof Error ? error.message : "Summary failed",
      });
    }
  });
}
