import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content required" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date();

    await db.insert(knowledge).values({
      id,
      title,
      content,
      sourceType: "text",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ id, title, content });
  } catch (error) {
    console.error("POST /api/knowledge error:", error);
    return NextResponse.json(
      { error: "Failed to create knowledge" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const items = await db.select().from(knowledge).all();
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/knowledge error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}
