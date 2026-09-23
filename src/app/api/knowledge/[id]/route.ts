import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const item = await db
      .select()
      .from(knowledge)
      .where(eq(knowledge.id, id))
      .get();

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const chunks = await db
      .select()
      .from(knowledgeChunk)
      .where(eq(knowledgeChunk.knowledgeId, id))
      .all();

    return NextResponse.json({ ...item, chunks });
  } catch (error) {
    console.error("GET /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, content, originalFilename, mimeType, sourceType } = body;

    const updateData: Record<string, unknown> = {
      title,
      updatedAt: new Date(),
    };
    if (content !== undefined) updateData.content = content;
    if (originalFilename !== undefined) updateData.originalFilename = originalFilename;
    if (mimeType !== undefined) updateData.mimeType = mimeType;
    if (sourceType !== undefined) updateData.sourceType = sourceType;

    await db
      .update(knowledge)
      .set(updateData)
      .where(eq(knowledge.id, id));

    return NextResponse.json({ id, title, content });
  } catch (error) {
    console.error("PUT /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update knowledge" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Cascade delete via schema foreign key
    await db.delete(knowledge).where(eq(knowledge.id, id));

    return NextResponse.json({ deleted: id });
  } catch (error) {
    console.error("DELETE /api/knowledge/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge" },
      { status: 500 }
    );
  }
}
