import { NextRequest, NextResponse } from "next/server";
import { suggestQuestions } from "@/lib/suggestions";

/** GET /api/suggestions?limit=3&seed=123 — answerable questions from the knowledge base. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(6, Math.max(1, Math.trunc(Number(params.get("limit")) || 3)));
  const rawSeed = Number(params.get("seed"));
  const seed = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : Date.now();

  try {
    const questions = await suggestQuestions(limit, seed);
    return NextResponse.json({ questions });
  } catch (error) {
    // Suggestions are optional: the chat keeps working without them.
    console.error("GET /api/suggestions error:", error);
    return NextResponse.json(
      { questions: [], error: "Suggestions are unavailable" },
      { status: 503 }
    );
  }
}
