import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const knowledge = sqliteTable("knowledge", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceType: text("source_type").notNull().default("text"), // 'text' or 'file'
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const knowledgeChunk = sqliteTable("knowledge_chunk", {
  id: text("id").primaryKey(),
  knowledgeId: text("knowledge_id")
    .notNull()
    .references(() => knowledge.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull(),
  metadata: text("metadata"), // JSON string for future extensibility
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const knowledgeRelations = relations(knowledge, ({ many }) => ({
  chunks: many(knowledgeChunk),
}));

export const knowledgeChunkRelations = relations(knowledgeChunk, ({ one }) => ({
  knowledge: one(knowledge, {
    fields: [knowledgeChunk.knowledgeId],
    references: [knowledge.id],
  }),
}));
