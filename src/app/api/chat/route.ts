import { NextRequest, NextResponse } from "next/server";
import { retrieveFromKnowledge } from "@/lib/retrieval";
import {
  buildRAGPrompt,
  generateWithOllama,
  NOT_FOUND_ANSWER,
} from "@/lib/ollama";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message required" },
        { status: 400 }
      );
    }

    // top-k and thresholds come from env (TOP_K, SIMILARITY_THRESHOLD, ...)
    const retrieval = await retrieveFromKnowledge(message);

    const trace = {
      query: retrieval.query,
      normalizedQuery: retrieval.normalizedQuery,
      topK: retrieval.topK,
      threshold: retrieval.threshold,
      coverageThreshold: retrieval.coverageThreshold,
      maxSimilarity: retrieval.maxSimilarity,
      maxCoverage: retrieval.maxCoverage,
      relevanceReason: retrieval.relevanceReason,
    };

    // Relevance gate runs BEFORE generation: never ask the LLM to improvise.
    if (!retrieval.relevant) {
      return NextResponse.json({
        answer: NOT_FOUND_ANSWER,
        sources: [],
        retrieval: trace,
      });
    }

    const prompt = buildRAGPrompt(
      message,
      retrieval.results.map((r) => ({ title: r.title, content: r.content }))
    );
    const answer = (await generateWithOllama(prompt)).trim();

    const sources = retrieval.results.map((r, i) => ({
      ref: i + 1,
      knowledgeId: r.knowledgeId,
      chunkId: r.chunkId,
      title: r.title,
      filename: r.filename,
      chunkIndex: r.chunkIndex,
      similarity: r.similarity,
      coverage: r.coverage,
    }));

    return NextResponse.json({
      answer,
      sources: answer === NOT_FOUND_ANSWER ? [] : sources,
      retrieval: trace,
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
