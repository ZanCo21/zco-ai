/**
 * Python AI Worker communication
 * Calls Python worker endpoints for document processing and retrieval
 */

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8001";

export interface WorkerChunk {
  chunk_index: number;
  content: string;
  word_count: number;
  /** Heading path ("A > B"), "" when the chunk has no heading. */
  section?: string;
}

export interface ProcessResult {
  chunks: WorkerChunk[];
  total_chunks: number;
  word_count?: number;
  language?: string | null;
}

export interface ConvertResult {
  markdown: string;
  pageCount: number | null;
  wordCount: number;
  language: string | null;
}

/** Use the worker's own error message ("PDF has no extractable text layer ...") when it sent one. */
async function workerError(res: Response, endpoint: string): Promise<Error> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") detail = body.error;
  } catch {
    // non-JSON body: keep statusText
  }
  return new Error(`Worker ${endpoint} failed: ${detail}`);
}

export async function callWorkerProcess(
  markdown: string,
  maxWords: number = 150,
  overlapWords: number = 20
): Promise<ProcessResult> {
  const res = await fetch(`${WORKER_URL}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: markdown,
      max_words: maxWords,
      overlap_words: overlapWords,
    }),
  });

  if (!res.ok) {
    throw await workerError(res, "/process");
  }

  return res.json();
}

export async function callWorkerConvert(
  filePath: string,
  originalFilename?: string
): Promise<ConvertResult> {
  const res = await fetch(`${WORKER_URL}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_path: filePath,
      original_filename: originalFilename,
    }),
  });

  if (!res.ok) {
    throw await workerError(res, "/convert");
  }

  const data = await res.json();
  return {
    markdown: data.markdown,
    pageCount: data.page_count ?? null,
    wordCount: data.word_count ?? 0,
    language: data.language ?? null,
  };
}

export interface SuggestChunk {
  content: string;
  word_count: number;
  /** Source document id; groups chunks per document. */
  doc: string;
  title: string;
}

export interface SuggestOptions {
  limit: number;
  seed: number;
  topK: number;
  threshold: number;
  coverageThreshold: number;
  minSimilarity: number;
}

export async function callWorkerSuggest(
  chunks: SuggestChunk[],
  opts: SuggestOptions
): Promise<Array<{ question: string; doc: string; title: string | null }>> {
  const res = await fetch(`${WORKER_URL}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunks,
      limit: opts.limit,
      seed: opts.seed,
      top_k: opts.topK,
      threshold: opts.threshold,
      coverage_threshold: opts.coverageThreshold,
      min_similarity: opts.minSimilarity,
    }),
  });

  if (!res.ok) {
    throw await workerError(res, "/suggest");
  }

  const data = await res.json();
  return data.questions ?? [];
}

export async function workerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
