/**
 * Progress events streamed (NDJSON, one JSON object per line) by long-running
 * routes: /api/upload?stream=1, /api/study/extract, /api/study/summary.
 * Every event is emitted by the server when the step actually starts/ends, so
 * the UI shows real backend state. Client-safe: no Node imports.
 */

export type StageStatus = "started" | "completed";

export type ProcessingEvent<T = unknown> =
  | {
      type: "stage";
      stage: string;
      status: StageStatus;
      /** Optional sub-progress, e.g. section 2 of 5 during summarization. */
      current?: number;
      total?: number;
    }
  | { type: "result"; data: T }
  | { type: "error"; stage: string; message: string };

/** Knowledge ingestion steps, in order (shown as the stepper in Add Knowledge). */
export const KNOWLEDGE_STAGES = ["upload", "extract", "process", "ready"] as const;
export type KnowledgeStage = (typeof KNOWLEDGE_STAGES)[number];

/**
 * Split a growing NDJSON buffer into complete events and the unfinished tail.
 * Malformed lines are skipped rather than aborting the whole stream.
 */
export function splitNdjson(buffer: string): { events: ProcessingEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ProcessingEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as ProcessingEvent);
    } catch {
      // ignore partial / corrupt line
    }
  }
  return { events, rest };
}

/**
 * Overall percentage for the knowledge stepper: each of the four steps is a
 * quarter; the upload quarter advances with the real number of bytes sent.
 */
export function knowledgeProgressPercent(
  completed: ReadonlySet<string>,
  uploadFraction: number
): number {
  const share = 100 / KNOWLEDGE_STAGES.length;
  let pct = 0;
  for (const stage of KNOWLEDGE_STAGES) {
    if (completed.has(stage)) pct += share;
    else if (stage === "upload") pct += share * Math.min(1, Math.max(0, uploadFraction));
  }
  return Math.round(pct);
}
