/**
 * Python AI Worker communication
 * Calls Python worker endpoints for document processing and retrieval
 */

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://127.0.0.1:8001";

export interface ProcessResult {
  chunks: Array<{
    chunk_index: number;
    content: string;
    word_count: number;
  }>;
  total_chunks: number;
}

export async function callWorkerProcess(
  markdown: string,
  maxWords: number = 300,
  overlapWords: number = 50
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
    throw new Error(`Worker /process failed: ${res.statusText}`);
  }

  return res.json();
}

export async function callWorkerConvert(filePath: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath }),
  });

  if (!res.ok) {
    throw new Error(`Worker /convert failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.markdown;
}

export async function workerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${WORKER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
