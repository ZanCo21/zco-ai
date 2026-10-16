"use client";

import React from "react";
import { ArrowLeft, Download, Lightbulb, Sparkles } from "lucide-react";
import {
  summaryToMarkdown,
  type StudyMaterial,
  type StudySummaryResult,
} from "@/lib/study-summary";

interface StudySummaryViewProps {
  material: StudyMaterial;
  result: StudySummaryResult;
  onBack: () => void;
}

function SectionHeading({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold flex items-center justify-center tabular-nums">
        {String(index).padStart(2, "0")}
      </span>
      <h3 className="text-lg font-semibold text-slate-900">{children}</h3>
    </div>
  );
}

export function StudySummaryView({ material, result, onBack }: StudySummaryViewProps) {
  const { summary } = result;
  let section = 0;

  const exportMarkdown = () => {
    const blob = new Blob([summaryToMarkdown(summary, material.filename)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${material.title.replace(/[^\w\- ]+/g, "").trim() || "study"}-summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to material
          </button>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">Study Summary</h2>
          <p className="text-sm text-slate-500 mt-1 break-words">
            {material.title} · Generated from your uploaded material
          </p>
        </div>
        <button
          type="button"
          onClick={exportMarkdown}
          className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export summary
        </button>
      </div>

      <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <header className="bg-indigo-600 text-white px-6 md:px-10 py-8">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-indigo-100">
            <Sparkles className="w-3.5 h-3.5" />
            AI-generated study notes
          </p>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold leading-tight break-words">
            {summary.title}
          </h1>
          {summary.overview && (
            <p className="mt-2 text-sm text-indigo-100 leading-relaxed">{summary.overview}</p>
          )}
        </header>

        <div className="px-6 md:px-10 py-8 space-y-8">
          <section className="space-y-3">
            <SectionHeading index={++section}>Core concept</SectionHeading>
            <p className="pl-[3.25rem] text-sm text-slate-600 leading-relaxed">{summary.coreConcept}</p>
          </section>

          {summary.keyConcepts.length > 0 && (
            <section className="space-y-3">
              <SectionHeading index={++section}>Key concepts</SectionHeading>
              <ul className="pl-[3.25rem] space-y-2">
                {summary.keyConcepts.map((c) => (
                  <li key={c.term} className="text-sm text-slate-600 leading-relaxed">
                    <span className="font-semibold text-slate-900">{c.term}</span> — {c.explanation}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.keyTakeaway && (
            <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5 flex gap-3">
              <Lightbulb className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Key takeaway</p>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{summary.keyTakeaway}</p>
              </div>
            </section>
          )}

          {summary.importantPoints.length > 0 && (
            <section className="space-y-3">
              <SectionHeading index={++section}>Important points to remember</SectionHeading>
              <ul className="pl-[3.25rem] grid sm:grid-cols-2 gap-3">
                {summary.importantPoints.map((p) => (
                  <li key={p} className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600 leading-relaxed">
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="px-6 md:px-10 py-4 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500 leading-relaxed">
          Summarized locally by {result.model} from {result.sourceWords.toLocaleString("en-US")} words of
          extracted text
          {result.sections > 1 ? ` (${result.sections} sections)` : ""}. Only the uploaded material is
          used as a source; verify important details in the original document.
          {result.droppedConcepts.length > 0 &&
            ` Removed ${result.droppedConcepts.length} concept(s) not found in the text: ${result.droppedConcepts.join(", ")}.`}
        </footer>
      </article>
    </div>
  );
}
