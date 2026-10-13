/**
 * Retrieval service - bridges database chunks with Python TF-IDF
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { retrievalConfig } from "@/lib/config";

const WORKER_URL = process.env.PYTHON_WORKER_URL || "http://127.0.0.1:8001";

export interface RetrievalChunk {
  knowledgeId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  filename: string | null;
  content: string;
  wordCount: number;
  /** Cosine similarity (TF-IDF). */
  similarity: number;
  /** IDF-weighted share of query terms present in the chunk. */
  coverage: number | null;
}

export interface RetrievalResult {
  query: string;
  normalizedQuery: string;
  results: RetrievalChunk[];
  topK: number;
  threshold: number;
  coverageThreshold: number;
  maxSimilarity: number | null;
  maxCoverage: number | null;
  relevant: boolean;
  /** Which relevance path passed: cosine threshold, term coverage, or none. */
  relevanceReason: "cosine" | "coverage" | "none";
}

interface PythonRetrievalChunk {
  chunk_index: number;
  similarity: number;
  coverage: number | null;
}

interface PythonRetrievalResponse {
  query: string;
  normalized_query: string;
  results: PythonRetrievalChunk[];
  top_k: number;
  threshold: number;
  coverage_threshold: number;
  max_similarity: number | null;
  max_coverage: number | null;
  relevant: boolean;
  relevance_reason: "cosine" | "coverage" | "none";
}

async function callRetrievalPython(
  chunks: Array<{ chunk_index: number; content: string; word_count: number }>,
  query: string,
  topK: number,
  cfg: ReturnType<typeof retrievalConfig>
): Promise<PythonRetrievalResponse> {
  const res = await fetch(`${WORKER_URL}/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunks,
      query,
      top_k: topK,
      threshold: cfg.threshold,
      coverage_threshold: cfg.coverageThreshold,
      min_similarity: cfg.minSimilarity,
    }),
  });

  if (!res.ok) {
    throw new Error(`Retrieval failed: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Retrieve the most relevant chunks. Thresholds and top-k default to the
 * environment configuration (SIMILARITY_THRESHOLD, TOP_K, ...); callers may
 * override per request.
 */
export async function retrieveFromKnowledge(
  query: string,
  topK?: number,
  threshold?: number
): Promise<RetrievalResult> {
  const cfg = retrievalConfig();
  if (threshold !== undefined) cfg.threshold = threshold;
  const k = topK ?? cfg.topK;

  const rows = await db
    .select({
      id: knowledgeChunk.id,
      knowledgeId: knowledgeChunk.knowledgeId,
      chunkIndex: knowledgeChunk.chunkIndex,
      content: knowledgeChunk.content,
      wordCount: knowledgeChunk.wordCount,
      title: knowledge.title,
      filename: knowledge.originalFilename,
    })
    .from(knowledgeChunk)
    .innerJoin(knowledge, eq(knowledgeChunk.knowledgeId, knowledge.id))
    .orderBy(knowledgeChunk.knowledgeId, knowledgeChunk.chunkIndex)
    .all();

  if (rows.length === 0) {
    return {
      query,
      normalizedQuery: query,
      results: [],
      topK: k,
      threshold: cfg.threshold,
      coverageThreshold: cfg.coverageThreshold,
      maxSimilarity: null,
      maxCoverage: null,
      relevant: false,
      relevanceReason: "none",
    };
  }

  // Use array position, not DB chunkIndex (indexes repeat across documents).
  const result = await callRetrievalPython(
    rows.map((c, index) => ({
      chunk_index: index,
      content: c.content,
      word_count: c.wordCount,
    })),
    query,
    k,
    cfg
  );

  const results = result.results.map((r) => {
    const row = rows[r.chunk_index];
    return {
      knowledgeId: row.knowledgeId,
      chunkId: row.id,
      chunkIndex: row.chunkIndex,
      title: row.title,
      filename: row.filename,
      content: row.content,
      wordCount: row.wordCount,
      similarity: r.similarity,
      coverage: r.coverage,
    };
  });

  return {
    query,
    normalizedQuery: result.normalized_query,
    results,
    topK: result.top_k,
    threshold: result.threshold,
    coverageThreshold: result.coverage_threshold,
    maxSimilarity: result.max_similarity,
    maxCoverage: result.max_coverage,
    relevant: result.relevant,
    relevanceReason: result.relevance_reason,
  };
}
