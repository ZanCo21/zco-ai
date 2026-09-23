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
  updateTextKnowledgeSchema,
  updateFileKnowledgeSchema,
} from "@/lib/validations/knowledge";
import { cn } from "@/lib/utils";

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface UpdateKnowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KnowledgeItem | null;
  onSuccess: () => void;
}

interface UpdateFormProps {
  item: KnowledgeItem;
  onClose: () => void;
  onSuccess: () => void;
}

function UpdateKnowledgeForm({ item, onClose, onSuccess }: UpdateFormProps) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFile = item.sourceType === "file";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!isFile) {
      const validation = updateTextKnowledgeSchema.safeParse({ title, content });
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
        const res = await fetch(`/api/knowledge/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
            sourceType: "text",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update knowledge");
        }

        onClose();
        onSuccess();
      } catch (err) {
        setErrors({
          form: err instanceof Error ? err.message : "Failed to update knowledge",
        });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const validation = updateFileKnowledgeSchema.safeParse({
        title,
        file: newFile,
      });
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
        if (newFile) {
          const formData = new FormData();
          formData.append("title", title.trim());
          formData.append("file", newFile);

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) {
            const data = await uploadRes.json().catch(() => ({}));
            throw new Error(data.error || "Failed to upload new file");
          }

          await fetch(`/api/knowledge/${item.id}`, { method: "DELETE" });
        } else {
          const res = await fetch(`/api/knowledge/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              originalFilename: item.originalFilename,
              mimeType: item.mimeType,
              sourceType: "file",
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to update knowledge");
          }
        }

        onClose();
        onSuccess();
      } catch (err) {
        setErrors({
          form: err instanceof Error ? err.message : "Failed to update knowledge",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errors.form && (
        <div className="p-3 text-xs rounded-xl bg-red-50 text-red-600 border border-red-100">
          {errors.form}
        </div>
      )}

      {/* Type Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Type:
        </span>
        <span
          className={cn(
            "text-xs px-2.5 py-0.5 rounded-full font-medium",
            isFile
              ? "bg-indigo-50 text-indigo-600"
              : "bg-emerald-50 text-emerald-600"
          )}
        >
          {isFile ? "File Document" : "Text Entry"}
        </span>
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

      {/* Content or File Field */}
      {!isFile ? (
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
            File Attachment
          </label>
          <FileUpload
            selectedFile={newFile}
            existingFilename={item.originalFilename || "Attached file"}
            onFileSelect={(selected) => setNewFile(selected)}
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Leave unchanged to keep existing file, or select a new file to
            replace it.
          </p>
        </div>
      )}

      {/* Modal Footer Buttons */}
      <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-xs"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export function UpdateKnowledgeModal({
  open,
  onOpenChange,
  item,
  onSuccess,
}: UpdateKnowledgeModalProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl p-6 bg-white border border-slate-200 shadow-xl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold text-slate-900">
            Edit Knowledge
          </DialogTitle>
        </DialogHeader>

        <UpdateKnowledgeForm
          key={item.id}
          item={item}
          onClose={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
