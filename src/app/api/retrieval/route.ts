import { NextRequest, NextResponse } from "next/server";
import { retrieveFromKnowledge } from "@/lib/retrieval";

export async function POST(req: NextRequest) {
  try {
    const { query, topK = 3 } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: "query required" },
        { status: 400 }
      );
    }

    const result = await retrieveFromKnowledge(query, topK);

    return NextResponse.json({
      query: result.query,
      results: result.results,
      threshold: result.threshold,
      maxSimilarity: result.maxSimilarity,
      relevant: result.relevant,
    });
  } catch (error) {
    console.error("POST /api/retrieval error:", error);
    return NextResponse.json(
      { error: "Retrieval failed" },
      { status: 500 }
    );
  }
}
