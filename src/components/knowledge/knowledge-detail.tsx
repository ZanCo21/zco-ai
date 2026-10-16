"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Layers,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { languageLabel } from "@/lib/knowledge-metadata";
import { fileExtension, formatFileSize } from "@/lib/upload-constraints";
import { cn } from "@/lib/utils";

export interface KnowledgeDetailItem {
  id: string;
  title: string;
  content: string;
  sourceType: string;
  originalFilename: string | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  fileSize: number | null;
  pageCount: number | null;
  wordCount: number | null;
  language: string | null;
  hasOriginalFile: boolean;
}

export interface KnowledgeDetailChunk {
  id: string;
  chunkIndex: number;
  content: string;
  wordCount: number;
  section: string | null;
}

const FILE_TYPES: Record<string, string> = {
  ".pdf": "PDF document",
  ".docx": "Word document",
  ".pptx": "PowerPoint presentation",
  ".xlsx": "Excel spreadsheet",
  ".xls": "Excel spreadsheet",
  ".txt": "Plain text",
  ".md": "Markdown",
  ".markdown": "Markdown",
  ".csv": "CSV table",
  ".tsv": "TSV table",
  ".json": "JSON",
  ".html": "HTML page",
  ".htm": "HTML page",
  ".xml": "XML",
};

function fileTypeLabel(item: KnowledgeDetailItem): string {
  if (item.sourceType !== "file") return "Text entry";
  const ext = fileExtension(item.originalFilename ?? "");
  return FILE_TYPES[ext] ?? (ext ? `${ext.slice(1).toUpperCase()} file` : "File");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The chunker prepends the heading path ("# A\n## B") to each chunk; show the body only. */
function chunkBody(content: string): string {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && /^#{1,6}\s/.test(lines[i])) i++;
  return lines.slice(i).join("\n").trim() || content;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function KnowledgeDetail({
  item,
  chunks,
}: {
  item: KnowledgeDetailItem;
  chunks: KnowledgeDetailChunk[];
}) {
  const ready = chunks.length > 0;
  const words = item.wordCount ?? countWords(item.content);
  const isPdf = fileExtension(item.originalFilename ?? "") === ".pdf";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Knowledge Base
        </Link>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight break-words">
              {item.title}
            </h2>
            <p className="text-sm text-slate-500 mt-1 break-all">
              {item.originalFilename ?? "Text entry"} · {ready ? "Ready for chat" : "Not indexed"}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 self-start sm:self-auto text-xs font-medium",
              ready ? "text-emerald-600" : "text-amber-600"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")} />
            {ready ? "Ready" : "No chunks"}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <Tabs defaultValue="info" className="gap-0">
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto rounded-none border-b border-slate-100 px-4 h-12"
          >
            <TabsTrigger value="info" className="flex-none px-3 data-active:text-indigo-600 after:bg-indigo-600">
              File information
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-none px-3 data-active:text-indigo-600 after:bg-indigo-600">
              Extracted text
            </TabsTrigger>
            <TabsTrigger value="chunks" className="flex-none px-3 data-active:text-indigo-600 after:bg-indigo-600">
              Knowledge chunks
              <span className="ml-1 rounded-full bg-indigo-50 text-indigo-600 px-1.5 text-[10px] font-semibold">
                {chunks.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <FileInformation item={item} words={words} chunkCount={chunks.length} isPdf={isPdf} />
          </TabsContent>
          <TabsContent value="text">
            <ExtractedText item={item} />
          </TabsContent>
          <TabsContent value="chunks">
            <ChunkList chunks={chunks} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FileInformation({
  item,
  words,
  chunkCount,
  isPdf,
}: {
  item: KnowledgeDetailItem;
  words: number;
  chunkCount: number;
  isPdf: boolean;
}) {
  const details: Array<[string, string]> = [
    ["File name", item.originalFilename ?? "—"],
    ["File type", fileTypeLabel(item)],
    ["File size", item.fileSize ? formatFileSize(item.fileSize) : "—"],
    ["Pages", item.pageCount ? `${item.pageCount} ${item.pageCount === 1 ? "page" : "pages"}` : "—"],
    ["Uploaded", formatDate(item.createdAt)],
    ["Language", languageLabel(item.language)],
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_320px]">
      {/* Preview */}
      <div className="bg-slate-50 p-4 md:p-6 min-h-[420px] border-b lg:border-b-0 lg:border-r border-slate-100">
        <p className="text-xs font-semibold text-slate-600 mb-3">Document preview</p>
        {isPdf && item.hasOriginalFile ? (
          <iframe
            src={`/api/knowledge/${item.id}/file`}
            title={`Preview of ${item.originalFilename}`}
            className="w-full h-[640px] rounded-lg border border-slate-200 bg-white"
          />
        ) : (
          <div className="mx-auto max-w-2xl bg-white rounded-lg border border-slate-200 shadow-xs p-6 md:p-10">
            {item.sourceType === "file" && (
              <p className="mb-4 text-[11px] text-slate-400">
                {item.hasOriginalFile
                  ? "Visual preview is available for PDF files. Showing the beginning of the extracted text."
                  : "The original file was not kept for this entry. Showing the beginning of the extracted text."}
              </p>
            )}
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-[24]">
              {item.content.slice(0, 4000)}
            </p>
            {item.hasOriginalFile && !isPdf && (
              <a
                href={`/api/knowledge/${item.id}/file`}
                className="mt-4 inline-block text-xs font-medium text-indigo-600 hover:underline"
              >
                Download original file
              </a>
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <aside className="p-5 md:p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">File details</h3>
        <dl className="divide-y divide-slate-100">
          {details.map(([label, value]) => (
            <div key={label} className="py-2.5">
              <dt className="text-[11px] text-slate-400">{label}</dt>
              <dd className="text-sm text-slate-800 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div
          className={cn(
            "mt-4 rounded-xl border p-3.5 flex items-start gap-3",
            chunkCount > 0 ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
          )}
        >
          {chunkCount > 0 ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          ) : (
            <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div>
            <p className="text-xs font-semibold text-slate-900">
              {chunkCount > 0 ? "Processing complete" : "Not searchable yet"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {words.toLocaleString("en-US")} words extracted into {chunkCount} knowledge{" "}
              {chunkCount === 1 ? "chunk" : "chunks"}.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ExtractedText({ item }: { item: KnowledgeDetailItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft.trim()) {
      setError("The text cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Re-chunked server-side, so retrieval uses the corrected text.
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, content: draft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save the corrected text");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the corrected text");
      setSaving(false);
    }
  };

  return (
    <div className="p-5 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Extracted text</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Review and correct the extracted content before using it in chat.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-sm font-medium transition-colors"
          >
            <PenLine className="w-4 h-4" />
            Correct text
          </button>
        ) : (
          <div className="flex gap-2 self-start">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft(item.content);
                setError(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Saving & re-chunking..." : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 text-xs rounded-xl bg-red-50 text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {editing ? (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            aria-label="Extracted text"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none text-sm font-mono text-slate-800 leading-relaxed resize-y"
          />
          <p className="text-[11px] text-slate-400 mt-1.5">
            Saving replaces the stored text and regenerates all knowledge chunks.
          </p>
        </div>
      ) : (
        <div className="mt-4 max-w-3xl mx-auto text-sm text-slate-700 leading-7 whitespace-pre-wrap break-words">
          {item.content || "(No text)"}
        </div>
      )}
    </div>
  );
}

function ChunkList({ chunks }: { chunks: KnowledgeDetailChunk[] }) {
  return (
    <div className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Knowledge chunks</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Extracted text is divided into searchable sections for more accurate answers.
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-indigo-50 text-indigo-600 px-2.5 py-1 text-xs font-medium">
          {chunks.length} {chunks.length === 1 ? "chunk" : "chunks"}
        </span>
      </div>

      {chunks.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Layers className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-700">No chunks</p>
          <p className="text-xs text-slate-400 mt-1">
            This entry cannot be retrieved in chat until its text is processed.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {chunks.map((chunk) => (
            <li key={chunk.id} className="py-4 flex gap-4">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold flex items-center justify-center tabular-nums">
                {String(chunk.chunkIndex + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 break-words">
                  {chunk.section || `Section ${chunk.chunkIndex + 1}`}
                </p>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed">
                  {chunkBody(chunk.content)}
                </p>
                <p className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  {chunk.wordCount} words · Chunk {chunk.chunkIndex + 1} of {chunks.length}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
