"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KnowledgeItem } from "./update-knowledge-modal";
import { FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewKnowledgeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KnowledgeItem | null;
}

export function ViewKnowledgeModal({
  open,
  onOpenChange,
  item,
}: ViewKnowledgeModalProps) {
  if (!item) return null;

  const isFile = item.sourceType === "file";
  const formattedDate = new Date(item.createdAt).toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-2xl p-6 bg-white border border-slate-200 shadow-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1">
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
          <DialogTitle className="text-xl font-bold text-slate-900 leading-snug">
            {item.title}
          </DialogTitle>
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Created {formattedDate}
            </span>
            {item.originalFilename && (
              <span className="flex items-center gap-1.5 text-blue-600">
                <FileText className="w-3.5 h-3.5" />
                {item.originalFilename}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Content
            </h4>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-800 font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {item.content || "(No content)"}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
