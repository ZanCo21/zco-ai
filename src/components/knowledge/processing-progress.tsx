"use client";

import React from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { KNOWLEDGE_STAGES, type KnowledgeStage } from "@/lib/processing-events";

export type StepState = "pending" | "active" | "done" | "error";

const STEP_LABELS: Record<KnowledgeStage, string> = {
  upload: "File uploaded",
  extract: "Extracting text",
  process: "Processing knowledge",
  ready: "Ready to use in chat",
};

interface ProcessingProgressProps {
  steps: Record<KnowledgeStage, StepState>;
  percent: number;
  uploadPercent: number;
  error?: string | null;
  onRetry?: () => void;
}

export function ProcessingProgress({
  steps,
  percent,
  uploadPercent,
  error,
  onRetry,
}: ProcessingProgressProps) {
  const failed = Boolean(error);
  const done = steps.ready === "done";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        failed ? "border-red-200 bg-red-50/40" : done ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/60"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {failed ? "Processing failed" : done ? "Knowledge is ready" : "Preparing your knowledge"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {failed
              ? "Nothing was added to the knowledge base."
              : done
                ? "You can now ask questions about this source in Chat."
                : "Keep this window open."}
          </p>
        </div>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            failed ? "text-red-600" : done ? "text-emerald-600" : "text-indigo-600"
          )}
        >
          {percent}%
        </span>
      </div>

      <Progress
        value={percent}
        aria-label="Processing progress"
        className={cn(
          "[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-slate-200",
          failed
            ? "[&_[data-slot=progress-indicator]]:bg-red-500"
            : done
              ? "[&_[data-slot=progress-indicator]]:bg-emerald-500"
              : "[&_[data-slot=progress-indicator]]:bg-indigo-600"
        )}
      />

      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {KNOWLEDGE_STAGES.map((stage, i) => {
          const state = steps[stage];
          return (
            <li key={stage} className="flex items-start gap-2 min-w-0">
              <span
                className={cn(
                  "mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold border",
                  state === "done" && "bg-emerald-500 border-emerald-500 text-white",
                  state === "active" && "border-indigo-600 text-indigo-600 bg-white",
                  state === "error" && "bg-red-500 border-red-500 text-white",
                  state === "pending" && "border-slate-300 text-slate-400 bg-white"
                )}
                aria-hidden
              >
                {state === "done" ? (
                  <Check className="w-3 h-3" />
                ) : state === "error" ? (
                  <X className="w-3 h-3" />
                ) : state === "active" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xs font-medium leading-tight",
                    state === "done" && "text-emerald-700",
                    state === "active" && "text-indigo-700",
                    state === "error" && "text-red-600",
                    state === "pending" && "text-slate-400"
                  )}
                >
                  {STEP_LABELS[stage]}
                </p>
                {state === "active" && (
                  <p className="text-[11px] text-indigo-500 mt-0.5">
                    {stage === "upload" ? `Uploading… ${uploadPercent}%` : "In progress…"}
                  </p>
                )}
                {state === "error" && <p className="text-[11px] text-red-500 mt-0.5">Failed</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-100 bg-white p-3">
          <p className="text-xs text-red-600 leading-relaxed">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
