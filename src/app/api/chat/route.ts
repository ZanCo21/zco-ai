import { NextRequest, NextResponse } from "next/server";
import { retrieveFromKnowledge } from "@/lib/retrieval";
import { buildRAGPrompt, generateWithOllama } from "@/lib/ollama";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "message required" },
        { status: 400 }
      );
    }

    // Retrieve relevant chunks
    const retrieval = await retrieveFromKnowledge(message, 3, 0.2);

    // Check relevance threshold
    if (!retrieval.relevant) {
      return NextResponse.json({
        answer:
          "Informasi yang diminta tidak ditemukan dalam knowledge base.",
        sources: [],
        retrieval: {
          maxSimilarity: retrieval.maxSimilarity,
          threshold: retrieval.threshold,
        },
      });
    }

    // Build context from relevant chunks
    const context = retrieval.results
      .map((r) => r.content)
      .join("\n\n");

    // Generate answer using Ollama
    const prompt = buildRAGPrompt(message, context);
    const answer = await generateWithOllama(prompt);

    // Format sources
    const sources = retrieval.results.map((r) => ({
      knowledgeId: r.knowledgeId,
      chunkId: r.chunkId,
      title: r.chunkIndex.toString(),
      similarity: r.similarity,
    }));

    return NextResponse.json({
      answer: answer.trim(),
      sources,
      retrieval: {
        maxSimilarity: retrieval.maxSimilarity,
        threshold: retrieval.threshold,
      },
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json(
      { error: "Chat failed" },
      { status: 500 }
    );
  }
}
