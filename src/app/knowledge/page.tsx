import { db } from "@/db";
import { knowledge } from "@/db/schema";
import { KnowledgeTable } from "@/components/knowledge/knowledge-table";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const items = await db.select().from(knowledge).all();

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
      <KnowledgeTable initialItems={items} />
    </div>
  );
}
