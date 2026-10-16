/**
 * Shape of the JSON stored in `knowledge.metadata` and `knowledge_chunk.metadata`.
 * Client-safe: no Node imports.
 */

export interface KnowledgeMetadata {
  fileSize?: number;
  /** PDFs only; null when unknown. */
  pageCount?: number | null;
  wordCount?: number;
  /** "id" | "en" | null (detected by the Python worker). */
  language?: string | null;
  /** Name of the original upload inside data/uploads (never a path). */
  storedFile?: string | null;
}

export interface ChunkMetadata {
  /** Heading path from the chunker, e.g. "Bab 2 > Uji Normalitas". */
  section?: string;
}

export function parseJsonObject<T extends object>(raw: string | null | undefined): Partial<T> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function languageLabel(code: string | null | undefined): string {
  if (code === "id") return "Indonesian";
  if (code === "en") return "English";
  return "Unknown";
}
