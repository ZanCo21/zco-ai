"use client";

import React, { useRef, useState } from "react";
import {
  Check,
  FileText,
  GraduationCap,
  Loader2,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StudyDropzone } from "./study-dropzone";
import { StudySummaryView } from "./study-summary-view";
import { languageLabel } from "@/lib/knowledge-metadata";
import type { ProcessingEvent } from "@/lib/processing-events";
import { isAbortError, streamRequest } from "@/lib/stream-request";
import type { StudyMaterial, StudySummaryResult } from "@/lib/study-summary";
import { formatFileSize } from "@/lib/upload-constraints";
import { cn } from "@/lib/utils";

type View = "upload" | "extracting" | "ready" | "summarizing" | "summary";

interface Failure {
  message: string;
  retry: "extract" | "summary";
}

/** Status line + percentage, computed only from events the server sent. */
interface Status {
  percent: number;
  label: string;
  detail: string;
}

const card = "bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 md:p-8";

export function StudyMode() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [result, setResult] = useState<StudySummaryResult | null>(null);
  const [status, setStatus] = useState<Status>({ percent: 0, label: "", detail: "" });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showText, setShowText] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startOver = () => {
    abortRef.current?.abort();
    setView("upload");
    setFile(null);
    setMaterial(null);
    setResult(null);
    setFailure(null);
    setShowText(false);
  };

  const cancelSummary = () => {
    abortRef.current?.abort();
    setFailure(null);
    setView("ready");
  };

  const extract = async (selected: File) => {
    setFile(selected);
    setFailure(null);
    setView("extracting");
    setStatus({ percent: 0, label: "Uploading your material…", detail: "Sending the file to the local server." });

    const controller = new AbortController();
    abortRef.current = controller;
    const formData = new FormData();
    formData.append("file", selected);
    try {
      const data = await streamRequest<StudyMaterial>({
        url: "/api/study/extract",
        body: formData,
        signal: controller.signal,
        onUploadProgress: (f) =>
          setStatus((s) => (s.percent < 50 ? { ...s, percent: Math.round(f * 50) } : s)),
        onEvent: (event) => {
          if (event.type !== "stage") return;
          if (event.stage === "extract" && event.status === "started") {
            setStatus({
              percent: 50,
              label: "Preparing your material…",
              detail: "Extracting the text and document structure.",
            });
          }
          if (event.stage === "extract" && event.status === "completed") {
            setStatus({ percent: 100, label: "Text extracted", detail: "Almost ready." });
          }
        },
      });
      setMaterial(data);
      setView("ready");
    } catch (error) {
      if (isAbortError(error)) return;
      setFailure({
        message: error instanceof Error ? error.message : "Extraction failed",
        retry: "extract",
      });
    }
  };

  const summarize = async () => {
    if (!material) return;
    setFailure(null);
    setView("summarizing");
    setStatus({ percent: 0, label: "Preparing the material…", detail: "Checking the local LLM and splitting the text." });

    const controller = new AbortController();
    abortRef.current = controller;
    const onEvent = (event: ProcessingEvent) => {
      if (event.type !== "stage" || event.status !== "started") return;
      if (event.stage === "summarize" && event.current && event.total) {
        setStatus({
          percent: 10 + Math.round((70 * (event.current - 1)) / event.total),
          label: `Summarizing section ${event.current} of ${event.total}…`,
          detail: "Writing grounded notes from the extracted text.",
        });
      }
      if (event.stage === "compose") {
        setStatus({
          percent: 85,
          label: "Composing study notes…",
          detail: "Structuring the core concept, key concepts and important points.",
        });
      }
    };
    try {
      const data = await streamRequest<StudySummaryResult>({
        url: "/api/study/summary",
        body: { title: material.title, text: material.text, language: material.language },
        signal: controller.signal,
        onEvent,
      });
      setResult(data);
      setView("summary");
    } catch (error) {
      if (isAbortError(error)) return;
      setFailure({
        message: error instanceof Error ? error.message : "Summary failed",
        retry: "summary",
      });
    }
  };

  if (view === "summary" && material && result) {
    return (
      <div className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
        <StudySummaryView material={material} result={result} onBack={() => setView("ready")} />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Study Mode</h2>
        <p className="text-sm text-slate-500 mt-1">
          Turn your learning materials into clear, structured study notes.
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <GraduationCap className="w-5 h-5" />
          </div>
          <p className="mt-3 text-[11px] font-semibold tracking-wider uppercase text-indigo-600">
            Learn smarter with AI
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">Upload material to start learning</h3>
          <p className="mt-1 text-xs text-slate-500">
            We&apos;ll extract the content and create an easy-to-review summary with key concepts and
            important points, using only what is in your file.
          </p>
        </div>

        {view === "upload" && <StudyDropzone onFile={extract} />}

        {(view === "extracting" || view === "summarizing") && file && (
          <div className={card}>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                <p className="text-[11px] text-slate-500">
                  {formatFileSize(file.size)} ·{" "}
                  {view === "summarizing" || status.percent >= 50 ? "Upload complete" : "Uploading"}
                </p>
              </div>
              <span className="text-sm font-semibold text-indigo-600 tabular-nums">{status.percent}%</span>
            </div>
            <Progress
              value={status.percent}
              aria-label="Progress"
              className={cn(
                "mt-4 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-slate-200",
                failure ? "[&_[data-slot=progress-indicator]]:bg-red-500" : "[&_[data-slot=progress-indicator]]:bg-indigo-600"
              )}
            />
            {failure ? (
              <FailureBox
                failure={failure}
                onRetry={() => (failure.retry === "extract" ? extract(file) : summarize())}
                onStartOver={startOver}
              />
            ) : (
              <div className="mt-4 text-center" role="status" aria-live="polite">
                <p className="text-sm text-slate-800 inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  {status.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{status.detail}</p>
                <button
                  type="button"
                  onClick={view === "summarizing" ? cancelSummary : startOver}
                  className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {view === "ready" && material && (
          <div className={cn(card, "text-center")}>
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-8 ring-emerald-50">
              <Check className="w-5 h-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Your material is ready</h3>
            <p className="text-xs text-slate-500 mt-1">
              Text has been extracted successfully and is ready to summarize.
            </p>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl bg-slate-50 p-4 text-left">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{material.title}</p>
                  <p className="text-[11px] text-slate-500 truncate">{material.filename}</p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-4 text-center shrink-0">
                <Stat label="Pages" value={material.pageCount ? String(material.pageCount) : "—"} />
                <Stat label="Words" value={material.wordCount.toLocaleString("en-US")} />
                <Stat label="Language" value={languageLabel(material.language)} />
              </dl>
            </div>

            <button
              type="button"
              onClick={() => setShowText((v) => !v)}
              className="mt-3 text-xs text-indigo-600 hover:underline"
            >
              {showText ? "Hide extracted text" : "Preview extracted text"}
            </button>
            {showText && (
              <pre className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left text-xs text-slate-600 whitespace-pre-wrap break-words font-sans">
                {material.text}
              </pre>
            )}

            <div className="mt-5 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={summarize}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-xs transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {result ? "Regenerate material summary" : "Create material summary"}
              </button>
              {result && (
                <button
                  type="button"
                  onClick={() => setView("summary")}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  View current summary
                </button>
              )}
              <button
                type="button"
                onClick={startOver}
                className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
              >
                Upload a different file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function FailureBox({
  failure,
  onRetry,
  onStartOver,
}: {
  failure: Failure;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50/60 p-4 text-left">
      <div className="flex gap-3">
        <TriangleAlert className="w-5 h-5 text-red-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-700">
            {failure.retry === "extract" ? "The material could not be processed" : "The summary could not be created"}
          </p>
          <p className="text-xs text-red-600 mt-1 break-words">{failure.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
            <button
              type="button"
              onClick={onStartOver}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-white transition-colors"
            >
              Upload a different file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
