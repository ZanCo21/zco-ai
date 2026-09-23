/**
 * Retrieval service - bridges database chunks with Python TF-IDF
 */

import { db } from "@/db";
import { knowledgeChunk } from "@/db/schema";

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://127.0.0.1:8001";

export interface RetrievalChunk {
  knowledgeId: string;
  chunkId: string;
  chunkIndex: number;
  content: string;
  wordCount: number;
  similarity: number;
}

export interface RetrievalResult {
  query: string;
  results: RetrievalChunk[];
  threshold: number;
  maxSimilarity: number | null;
  relevant: boolean;
}

interface PythonRetrievalChunk {
  chunk_index: number;
  similarity: number;
}

interface PythonRetrievalResponse {
  query: string;
  results: PythonRetrievalChunk[];
  threshold: number;
  max_similarity: number | null;
  relevant: boolean;
}

async function callRetrievalPython(
  chunks: Array<{ chunk_index: number; content: string; word_count: number }>,
  query: string,
  topK: number,
  threshold: number
): Promise<PythonRetrievalResponse> {
  const res = await fetch(`${WORKER_URL}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunks,
      query,
      top_k: topK,
      threshold,
    }),
  });

  if (!res.ok) {
    throw new Error(`Retrieval failed: ${res.statusText}`);
  }

  return res.json();
}

export async function retrieveFromKnowledge(
  query: string,
  topK: number = 3,
  threshold: number = 0.2
): Promise<RetrievalResult> {
  // Fetch all chunks from database
  const chunks = await db.select().from(knowledgeChunk).all();

  if (chunks.length === 0) {
    return {
      query,
      results: [],
      threshold,
      maxSimilarity: null,
      relevant: false,
    };
  }

  // Format chunks for Python worker
  const formattedChunks = chunks.map((c) => ({
    chunk_index: c.chunkIndex,
    content: c.content,
    word_count: c.wordCount,
  }));

  // Call Python worker for retrieval
  const result = await callRetrievalPython(
    formattedChunks,
    query,
    topK,
    threshold
  );

  // Map results back to database IDs
  const enrichedResults = result.results.map((r) => {
    const chunk = chunks[r.chunk_index];
    return {
      knowledgeId: chunk.knowledgeId,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      wordCount: chunk.wordCount,
      similarity: r.similarity,
    };
  });

  return {
    query,
    results: enrichedResults,
    threshold: result.threshold,
    maxSimilarity: result.max_similarity,
    relevant: result.relevant,
  };
}
