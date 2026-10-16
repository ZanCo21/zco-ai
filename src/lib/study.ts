/**
 * Study Mode summarization: abstractive summary of extracted material using
 * the local LLM (Ollama), grounded in the extracted text only.
 *
 *   text --(worker /process, large sections)--> sections
 *        --(Ollama, one call per section)-----> grounded notes      (map)
 *        --(Ollama, JSON schema output)-------> structured summary  (reduce)
 *        --(groundSummary)--------------------> concepts not in the text dropped
 */

import { callWorkerProcess } from "@/lib/ai";
import { PipelineError } from "@/lib/document-pipeline";
import { generateWithOllama, ollamaHealth, OLLAMA_MODEL } from "@/lib/ollama";
import type { StageStatus } from "@/lib/processing-events";
import {
  buildSectionNotesPrompt,
  buildSummaryPrompt,
  groundSummary,
  parseStudySummary,
  sectionWordsFor,
  STUDY_SUMMARY_JSON_SCHEMA,
  type StudySummary,
  type StudySummaryResult,
} from "@/lib/study-summary";

export type StudyStage = "prepare" | "summarize" | "compose";

interface SummarizeInput {
  title: string;
  text: string;
  language?: string | null;
  onStage?: (stage: StudyStage, status: StageStatus, progress?: { current: number; total: number }) => void;
  signal?: AbortSignal;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function summarizeMaterial({
  title,
  text,
  language,
  onStage = () => {},
  signal,
}: SummarizeInput): Promise<StudySummaryResult> {
  onStage("prepare", "started");
  if (!(await ollamaHealth())) {
    throw new PipelineError(
      "The local LLM (Ollama) is not reachable. Start Ollama and try again.",
      "prepare",
      503
    );
  }

  const sourceWords = countWords(text);
  let sectionWords: number;
  try {
    sectionWords = sectionWordsFor(sourceWords);
  } catch (error) {
    throw new PipelineError((error as Error).message, "prepare", 413);
  }

  let sections: string[] = [text];
  if (sectionWords > 0) {
    try {
      // Same structure-preserving chunker as ingestion, with large sections.
      const processed = await callWorkerProcess(text, sectionWords, 0);
      sections = processed.chunks.map((c) => c.content);
    } catch (error) {
      console.error("Study sectioning failed:", error);
      throw new PipelineError(
        "The material could not be split into sections. Check that the Python worker is running.",
        "prepare",
        502
      );
    }
  }
  onStage("prepare", "completed");

  let source = text;
  let sourceKind: "text" | "notes" = "text";
  if (sections.length > 1) {
    const notes: string[] = [];
    for (let i = 0; i < sections.length; i++) {
      onStage("summarize", "started", { current: i + 1, total: sections.length });
      try {
        const note = await generateWithOllama(
          buildSectionNotesPrompt(title, sections[i], i + 1, sections.length, language),
          { signal }
        );
        notes.push(`[Bagian ${i + 1}]\n${note.trim()}`);
      } catch (error) {
        if (signal?.aborted) throw new PipelineError("Summary cancelled.", "summarize", 499);
        throw new PipelineError(
          `Section ${i + 1} of ${sections.length} could not be summarized: ${(error as Error).message}`,
          "summarize",
          502
        );
      }
    }
    onStage("summarize", "completed", { current: sections.length, total: sections.length });
    source = notes.join("\n\n");
    sourceKind = "notes";
  }

  onStage("compose", "started");
  const prompt = buildSummaryPrompt(title, source, sourceKind, language);
  let summary: StudySummary | null = null;
  // Small models occasionally emit invalid JSON: one retry before failing.
  for (let attempt = 0; attempt < 2 && !summary; attempt++) {
    try {
      const raw = await generateWithOllama(prompt, {
        format: STUDY_SUMMARY_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal,
      });
      summary = parseStudySummary(raw);
    } catch (error) {
      if (signal?.aborted) throw new PipelineError("Summary cancelled.", "compose", 499);
      throw new PipelineError(
        `The summary could not be generated: ${(error as Error).message}`,
        "compose",
        502
      );
    }
  }
  if (!summary) {
    throw new PipelineError(
      "The local LLM returned an invalid summary. Please try again.",
      "compose",
      502
    );
  }

  const grounded = groundSummary(summary, text);
  onStage("compose", "completed");

  return {
    summary: grounded.summary,
    sections: sections.length,
    sourceWords,
    model: OLLAMA_MODEL,
    droppedConcepts: grounded.droppedConcepts,
  };
}
