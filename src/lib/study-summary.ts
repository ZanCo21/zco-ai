/**
 * Study Mode: prompts, output schema and grounding check for LLM-based
 * abstractive summarization of extracted study material.
 *
 * Long material is summarized map-reduce style: each section is condensed
 * into grounded notes, then the notes are composed into the structured
 * summary. Pure module (no Node / path-alias imports) so it is unit-testable.
 */

import { z } from "zod";

/** Material up to this size is summarized in a single pass. */
export const DIRECT_SUMMARY_MAX_WORDS = 2500;
export const SECTION_WORDS = 1500;
/** Keeps a section within gemma3:4b's 8k-token window together with the prompt. */
export const MAX_SECTION_WORDS = 2500;
export const MAX_SECTIONS = 12;
export const MAX_SUMMARY_WORDS = MAX_SECTION_WORDS * MAX_SECTIONS;

export const studySummarySchema = z.object({
  title: z.string().trim().min(1),
  overview: z.string().trim().default(""),
  coreConcept: z.string().trim().min(1),
  keyConcepts: z
    .array(z.object({ term: z.string().trim().min(1), explanation: z.string().trim().min(1) }))
    .default([]),
  keyTakeaway: z.string().trim().default(""),
  importantPoints: z.array(z.string().trim().min(1)).default([]),
});

export type StudySummary = z.infer<typeof studySummarySchema>;

/** Extracted study material returned by /api/study/extract (not stored). */
export interface StudyMaterial {
  title: string;
  filename: string;
  fileSize: number;
  pageCount: number | null;
  wordCount: number;
  language: string | null;
  text: string;
}

/** Result of /api/study/summary. */
export interface StudySummaryResult {
  summary: StudySummary;
  sections: number;
  sourceWords: number;
  model: string;
  droppedConcepts: string[];
}

/** JSON schema passed to Ollama's `format` so the model must return this shape. */
export const STUDY_SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    coreConcept: { type: "string" },
    keyConcepts: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, explanation: { type: "string" } },
        required: ["term", "explanation"],
      },
    },
    keyTakeaway: { type: "string" },
    importantPoints: { type: "array", items: { type: "string" } },
  },
  required: ["title", "overview", "coreConcept", "keyConcepts", "keyTakeaway", "importantPoints"],
} as const;

export function languageName(code: string | null | undefined): string {
  if (code === "id") return "Bahasa Indonesia";
  if (code === "en") return "English";
  return "bahasa yang sama dengan materi";
}

/**
 * How many words per section (0 = single pass). Throws when the material is
 * too long to summarize within the section budget.
 */
export function sectionWordsFor(totalWords: number): number {
  if (totalWords <= DIRECT_SUMMARY_MAX_WORDS) return 0;
  if (totalWords > MAX_SUMMARY_WORDS) {
    throw new RangeError(
      `The material has ${totalWords.toLocaleString("en-US")} words; Study Mode supports up to ${MAX_SUMMARY_WORDS.toLocaleString("en-US")} words.`
    );
  }
  return Math.min(MAX_SECTION_WORDS, Math.max(SECTION_WORDS, Math.ceil(totalWords / MAX_SECTIONS)));
}

export function buildSectionNotesPrompt(
  title: string,
  section: string,
  index: number,
  total: number,
  language: string | null | undefined
): string {
  return `Anda membantu membuat catatan belajar. Baca BAGIAN ${index} dari ${total} materi "${title}" di bawah, lalu tulis catatan poin-poin penting.

ATURAN:
1. Gunakan HANYA informasi yang tertulis dalam BAGIAN. Jangan menambah fakta, contoh, angka, atau pengetahuan dari luar.
2. Tulis ulang dengan kalimat sendiri yang ringkas, tetapi salin istilah, nama, angka, dan rumus persis seperti di teks.
3. Tulis 3 sampai 8 poin, masing-masing diawali "- ". Untuk istilah yang didefinisikan, tulis "- Istilah: penjelasan".
4. Tulis dalam ${languageName(language)}.
5. Jangan menulis kalimat pembuka atau penutup.

BAGIAN ${index}:
"""
${section}
"""

CATATAN:`;
}

export function buildSummaryPrompt(
  title: string,
  source: string,
  sourceKind: "text" | "notes",
  language: string | null | undefined
): string {
  const kind =
    sourceKind === "notes"
      ? "catatan per bagian yang dibuat dari materi tersebut"
      : "teks hasil ekstraksi materi tersebut";
  return `Anda menyusun ringkasan belajar untuk materi "${title}". SUMBER di bawah adalah ${kind}.

ATURAN:
1. Gunakan HANYA informasi dalam SUMBER. Jangan mengarang fakta, contoh, angka, atau istilah yang tidak ada di SUMBER.
2. Ringkas secara abstraktif: tulis ulang dengan kalimat sendiri yang jelas dan padat, jangan menyalin paragraf utuh.
3. Salin istilah teknis, nama, angka, dan rumus persis seperti di SUMBER.
4. Tulis seluruh isi dalam ${languageName(language)}.
5. Isi field JSON berikut:
   - title: judul singkat topik utama materi (maksimal 8 kata)
   - overview: satu kalimat gambaran umum isi materi
   - coreConcept: 2 sampai 4 kalimat yang menjelaskan gagasan inti materi
   - keyConcepts: 3 sampai 8 konsep penting; term = istilah persis seperti tertulis di SUMBER, explanation = penjelasan satu kalimat
   - keyTakeaway: satu kalimat pesan utama yang paling penting diingat
   - importantPoints: 4 sampai 8 poin penting untuk diingat, masing-masing satu kalimat pendek
6. Jika SUMBER tidak cukup untuk suatu field, isi seadanya dari SUMBER atau kosongkan; jangan menebak.

SUMBER:
"""
${source}
"""`;
}

/** Parse the model's JSON output; null when it is not a valid summary. */
export function parseStudySummary(raw: string): StudySummary | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = studySummarySchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Anti-hallucination guard: a key concept is kept only if its term occurs in
 * the source text (as a phrase, or most of its words do). List sizes are capped.
 */
export function groundSummary(
  summary: StudySummary,
  sourceText: string
): { summary: StudySummary; droppedConcepts: string[] } {
  const source = ` ${normalizeForMatch(sourceText)} `;
  const sourceWords = new Set(source.split(" "));
  const droppedConcepts: string[] = [];

  const keyConcepts = summary.keyConcepts.filter(({ term }) => {
    const norm = normalizeForMatch(term);
    if (!norm) return false;
    if (source.includes(` ${norm} `)) return true;
    const words = norm.split(" ").filter((w) => w.length >= 3);
    const found = words.filter((w) => sourceWords.has(w)).length;
    const ok = words.length > 0 && found / words.length >= 0.6;
    if (!ok) droppedConcepts.push(term);
    return ok;
  });

  return {
    summary: {
      ...summary,
      keyConcepts: keyConcepts.slice(0, 8),
      importantPoints: summary.importantPoints.slice(0, 8),
    },
    droppedConcepts,
  };
}

/** Markdown export of a summary (Study Mode "Export summary"). */
export function summaryToMarkdown(summary: StudySummary, sourceName: string): string {
  const lines = [`# ${summary.title}`, ""];
  if (summary.overview) lines.push(`_${summary.overview}_`, "");
  lines.push(`Source: ${sourceName}`, "", "## Core concept", "", summary.coreConcept, "");
  if (summary.keyConcepts.length) {
    lines.push("## Key concepts", "");
    for (const c of summary.keyConcepts) lines.push(`- **${c.term}** — ${c.explanation}`);
    lines.push("");
  }
  if (summary.keyTakeaway) lines.push("## Key takeaway", "", `> ${summary.keyTakeaway}`, "");
  if (summary.importantPoints.length) {
    lines.push("## Important points to remember", "");
    for (const p of summary.importantPoints) lines.push(`- ${p}`);
    lines.push("");
  }
  return lines.join("\n");
}
