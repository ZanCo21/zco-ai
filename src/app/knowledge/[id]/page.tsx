import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledge, knowledgeChunk } from "@/db/schema";
import { KnowledgeDetail } from "@/components/knowledge/knowledge-detail";
import {
  parseJsonObject,
  type ChunkMetadata,
  type KnowledgeMetadata,
} from "@/lib/knowledge-metadata";

export const dynamic = "force-dynamic";

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const item = db.select().from(knowledge).where(eq(knowledge.id, id)).get();
  if (!item) notFound();

  const chunks = db
    .select()
    .from(knowledgeChunk)
    .where(eq(knowledgeChunk.knowledgeId, id))
    .orderBy(asc(knowledgeChunk.chunkIndex))
    .all();

  const metadata = parseJsonObject<KnowledgeMetadata>(item.metadata);

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
      <KnowledgeDetail
        // re-mount after "Correct text" saves, so local edit state resets
        key={item.updatedAt.getTime()}
        item={{
          id: item.id,
          title: item.title,
          content: item.content,
          sourceType: item.sourceType,
          originalFilename: item.originalFilename,
          mimeType: item.mimeType,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          fileSize: metadata.fileSize ?? null,
          pageCount: metadata.pageCount ?? null,
          wordCount: metadata.wordCount ?? null,
          language: metadata.language ?? null,
          hasOriginalFile: Boolean(metadata.storedFile),
        }}
        chunks={chunks.map((c) => ({
          id: c.id,
          chunkIndex: c.chunkIndex,
          content: c.content,
          wordCount: c.wordCount,
          section: parseJsonObject<ChunkMetadata>(c.metadata).section ?? null,
        }))}
      />
    </div>
  );
}
