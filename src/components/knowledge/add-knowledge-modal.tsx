"use client";

import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "./file-upload";
import { ProcessingProgress, type StepState } from "./processing-progress";
import {
  createTextKnowledgeSchema,
  createFileKnowledgeSchema,
} from "@/lib/validations/knowledge";
import {
  KNOWLEDGE_STAGES,
  knowledgeProgressPercent,
  type KnowledgeStage,
} from "@/lib/processing-events";
import { isAbortError, streamRequest, StreamRequestError } from "@/lib/stream-request";
import { cn } from "@/lib/utils";

interface AddKnowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type InputType = "text" | "file";
type Phase = "idle" | "processing" | "failed" | "done";

const initialSteps = (): Record<KnowledgeStage, StepState> => ({
  upload: "pending",
  extract: "pending",
  process: "pending",
  ready: "pending",
});

export function AddKnowledgeModal({
  open,
  onOpenChange,
  onSuccess,
}: AddKnowledgeModalProps) {
  const [inputType, setInputType] = useState<InputType>("file");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // File processing state, driven by events streamed from /api/upload?stream=1
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState(initialSteps);
  const [uploadFraction, setUploadFraction] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const completed = new Set(KNOWLEDGE_STAGES.filter((s) => steps[s] === "done"));
  const percent = knowledgeProgressPercent(completed, uploadFraction);

  const resetProcessing = () => {
    setPhase("idle");
    setSteps(initialSteps());
    setUploadFraction(0);
    setProcessingError(null);
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setFile(null);
    setErrors({});
    setInputType("file");
    resetProcessing();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Closing while processing cancels the request; the server skips the
      // database insert when the client is gone.
      abortRef.current?.abort();
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const setStep = (stage: KnowledgeStage, state: StepState) =>
    setSteps((prev) => ({ ...prev, [stage]: state }));

  const uploadFile = async () => {
    if (!file) return;
    resetProcessing();
    setPhase("processing");
    setStep("upload", "active");

    const controller = new AbortController();
    abortRef.current = controller;
    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("file", file);

    try {
      await streamRequest({
        url: "/api/upload?stream=1",
        body: formData,
        signal: controller.signal,
        onUploadProgress: setUploadFraction,
        onEvent: (event) => {
          if (event.type !== "stage") return;
          const stage = event.stage as KnowledgeStage;
          if (!KNOWLEDGE_STAGES.includes(stage)) return;
          setStep(stage, event.status === "completed" ? "done" : "active");
          if (event.status === "completed" && stage !== "ready") {
            const next = KNOWLEDGE_STAGES[KNOWLEDGE_STAGES.indexOf(stage) + 1];
            // the next step starts as soon as the server finishes this one
            setSteps((prev) => (prev[next] === "pending" ? { ...prev, [next]: "active" } : prev));
          }
        },
      });
      setPhase("done");
      onSuccess();
    } catch (err) {
      if (isAbortError(err)) return;
      const message = err instanceof Error ? err.message : "Failed to upload file";
      const failedStage =
        err instanceof StreamRequestError && KNOWLEDGE_STAGES.includes(err.stage as KnowledgeStage)
          ? (err.stage as KnowledgeStage)
          : undefined;
      setSteps((prev) => {
        const stage = failedStage ?? KNOWLEDGE_STAGES.find((s) => prev[s] === "active") ?? "upload";
        const next = { ...prev };
        for (const s of KNOWLEDGE_STAGES) if (next[s] === "active") next[s] = "pending";
        next[stage] = "error";
        return next;
      });
      setProcessingError(message);
      setPhase("failed");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (inputType === "text") {
      const validation = createTextKnowledgeSchema.safeParse({ title, content });
      if (!validation.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of validation.error.issues) {
          if (issue.path[0]) {
            fieldErrors[String(issue.path[0])] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create knowledge");
        }

        resetForm();
        onOpenChange(false);
        onSuccess();
      } catch (err) {
        setErrors({
          form: err instanceof Error ? err.message : "Failed to create knowledge",
        });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (phase === "done") {
        handleOpenChange(false);
        return;
      }
      const validation = createFileKnowledgeSchema.safeParse({ title, file });
      if (!validation.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of validation.error.issues) {
          if (issue.path[0]) {
            fieldErrors[String(issue.path[0])] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }
      await uploadFile();
    }
  };

  const processing = phase === "processing";
  const locked = processing || phase === "done";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-2xl p-6 bg-white border border-slate-200 shadow-xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-slate-900">
            Add Knowledge
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Add a source to ground your AI responses.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errors.form && (
            <div className="p-3 text-xs rounded-xl bg-red-50 text-red-600 border border-red-100">
              {errors.form}
            </div>
          )}

          {/* Input Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Input Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["file", "text"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setInputType(type);
                    setErrors({});
                    resetProcessing();
                  }}
                  className={cn(
                    "py-2.5 px-4 text-sm font-medium rounded-xl transition-all text-center disabled:cursor-not-allowed",
                    inputType === type
                      ? "border-2 border-indigo-600 text-indigo-600 bg-indigo-50/50"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white disabled:opacity-50"
                  )}
                >
                  {type === "file" ? "Upload File" : "Text Entry"}
                </button>
              ))}
            </div>
          </div>

          {/* Title Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              disabled={locked}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter knowledge title"
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none disabled:bg-slate-50 disabled:text-slate-500",
                errors.title
                  ? "border-red-400 focus:border-red-500"
                  : "border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600",
                "placeholder:text-slate-400 text-slate-800"
              )}
            />
            {errors.title && (
              <p className="text-xs text-red-500 font-medium mt-1">
                {errors.title}
              </p>
            )}
          </div>

          {/* Conditional Content or File Upload */}
          {inputType === "text" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Content <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter description or content"
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none resize-y",
                  errors.content
                    ? "border-red-400 focus:border-red-500"
                    : "border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600",
                  "placeholder:text-slate-400 text-slate-800"
                )}
              />
              {errors.content && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  {errors.content}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Upload File <span className="text-red-500">*</span>
                </label>
                <FileUpload
                  selectedFile={file}
                  disabled={locked}
                  onFileSelect={(selected) => {
                    setFile(selected);
                    resetProcessing();
                    if (selected && !title.trim()) {
                      setTitle(selected.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
                {errors.file && (
                  <p className="text-xs text-red-500 font-medium mt-1">
                    {errors.file}
                  </p>
                )}
              </div>

              {phase !== "idle" && (
                <ProcessingProgress
                  steps={steps}
                  percent={percent}
                  uploadPercent={Math.round(uploadFraction * 100)}
                  error={processingError}
                  onRetry={phase === "failed" ? uploadFile : undefined}
                />
              )}
            </div>
          )}

          {/* Modal Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            {phase !== "done" && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || processing}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-xs"
            >
              {isSubmitting
                ? "Adding..."
                : processing
                  ? "Processing..."
                  : phase === "done"
                    ? "Done"
                    : phase === "failed"
                      ? "Try again"
                      : "Add Knowledge"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
