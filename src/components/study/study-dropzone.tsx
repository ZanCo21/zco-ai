"use client";

import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_MB, UPLOAD_ACCEPT, validateUploadFile } from "@/lib/upload-constraints";

interface StudyDropzoneProps {
  onFile: (file: File) => void;
  error?: string | null;
}

/** Large drop area for Study Mode: click, keyboard (Enter/Space) or drag-and-drop. */
export function StudyDropzone({ onFile, error }: StudyDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = validateUploadFile(file);
    setLocalError(problem);
    if (!problem) onFile(file);
  };

  const shownError = localError ?? error;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload study material: drag and drop a file or press Enter to choose one"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed bg-white px-6 py-14 flex flex-col items-center text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          dragging ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300"
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
          <Upload className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-slate-900">Drag and drop your study material</p>
        <p className="text-xs text-slate-500 mt-1">or choose a file from your computer</p>
        <span className="mt-5 inline-flex items-center px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-xs transition-colors">
          Choose file
        </span>
        <p className="text-[11px] text-slate-400 mt-4">
          Supports PDF, DOCX, PPTX, TXT, MD · Maximum {MAX_UPLOAD_MB} MB
        </p>
      </div>
      {shownError && (
        <p role="alert" className="text-xs text-red-600 font-medium text-center">
          {shownError}
        </p>
      )}
    </div>
  );
}
