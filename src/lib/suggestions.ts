/**
 * Suggested chat questions. Question generation and the answerability check
 * (same TF-IDF relevance gate as chat) live in the Python worker (/suggest);
 * this module only loads the chunks and passes the retrieval configuration.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { callWorkerSuggest } from "@/lib/ai";
import { retrievalConfig } from "@/lib/config";

export interface SuggestedQuestion {
  question: string;
  knowledgeId: string;
  title: string | null;
}

export async function suggestQuestions(limit: number, seed: number): Promise<SuggestedQuestion[]> {
  const rows = await db
    .select({
      knowledgeId: knowledgeChunk.knowledgeId,
      content: knowledgeChunk.content,
      wordCount: knowledgeChunk.wordCount,
      title: knowledge.title,
    })
    .from(knowledgeChunk)
    .innerJoin(knowledge, eq(knowledgeChunk.knowledgeId, knowledge.id))
    .orderBy(knowledgeChunk.knowledgeId, knowledgeChunk.chunkIndex)
    .all();

  if (rows.length === 0) return [];

  const cfg = retrievalConfig();
  const questions = await callWorkerSuggest(
    rows.map((r) => ({
      content: r.content,
      word_count: r.wordCount,
      doc: r.knowledgeId,
      title: r.title,
    })),
    {
      limit,
      seed,
      topK: cfg.topK,
      threshold: cfg.threshold,
      coverageThreshold: cfg.coverageThreshold,
      minSimilarity: cfg.minSimilarity,
    }
  );

  return questions.map((q) => ({ question: q.question, knowledgeId: q.doc, title: q.title }));
}
