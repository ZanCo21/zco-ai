"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "./file-upload";
import {
  createTextKnowledgeSchema,
  createFileKnowledgeSchema,
} from "@/lib/validations/knowledge";
import { cn } from "@/lib/utils";

interface AddKnowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type InputType = "text" | "file";

export function AddKnowledgeModal({
  open,
  onOpenChange,
  onSuccess,
}: AddKnowledgeModalProps) {
  const [inputType, setInputType] = useState<InputType>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setFile(null);
    setErrors({});
    setInputType("text");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
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

      setIsSubmitting(true);
      try {
        const formData = new FormData();
        formData.append("title", title.trim());
        if (file) {
          formData.append("file", file);
        }

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to upload document");
        }

        resetForm();
        onOpenChange(false);
        onSuccess();
      } catch (err) {
        setErrors({
          form: err instanceof Error ? err.message : "Failed to upload file",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-6 bg-white border border-slate-200 shadow-xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-slate-900">
            Add Knowledge
          </DialogTitle>
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
              <button
                type="button"
                onClick={() => {
                  setInputType("text");
                  setErrors({});
                }}
                className={cn(
                  "py-2.5 px-4 text-sm font-medium rounded-xl transition-all text-center",
                  inputType === "text"
                    ? "border-2 border-indigo-600 text-indigo-600 bg-indigo-50/50"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white"
                )}
              >
                Text Entry
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputType("file");
                  setErrors({});
                }}
                className={cn(
                  "py-2.5 px-4 text-sm font-medium rounded-xl transition-all text-center",
                  inputType === "file"
                    ? "border-2 border-indigo-600 text-indigo-600 bg-indigo-50/50"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white"
                )}
              >
                Upload File
              </button>
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
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter knowledge title"
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors outline-none",
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Upload File <span className="text-red-500">*</span>
              </label>
              <FileUpload
                selectedFile={file}
                onFileSelect={(selected) => setFile(selected)}
              />
              {errors.file && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  {errors.file}
                </p>
              )}
            </div>
          )}

          {/* Modal Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Adding..." : "Add Knowledge"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
