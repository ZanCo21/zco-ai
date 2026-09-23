"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile?: File | null;
  existingFilename?: string | null;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  selectedFile = null,
  existingFilename = null,
  accept = ".pdf,.docx,.doc,.txt,.xls,.xlsx,.md",
  maxSizeMB = 50,
  className,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleFileChange = (file: File | null) => {
    setError(null);
    if (!file) {
      onFileSelect(null);
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size exceeds limit of ${maxSizeMB}MB`);
      return;
    }

    onFileSelect(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const hasFile = Boolean(selectedFile || existingFilename);

  return (
    <div className={cn("w-full space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileChange(e.target.files[0]);
          }
        }}
      />

      {!hasFile ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-2xl py-10 px-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all outline-none",
            isDragging
              ? "border-indigo-500 bg-indigo-50/40 scale-[0.99]"
              : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/60"
          )}
        >
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
            <UploadCloud className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            Click to upload a file
          </p>
          <p className="text-xs text-slate-400 mt-1">
            PDF, DOCX, TXT, XLS up to {maxSizeMB}MB
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {selectedFile ? selectedFile.name : existingFilename}
              </p>
              <p className="text-xs text-slate-400">
                {selectedFile
                  ? formatFileSize(selectedFile.size)
                  : "Existing file attached"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline px-2 py-1"
            >
              Change
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 font-medium pl-1">{error}</p>
      )}
    </div>
  );
}
