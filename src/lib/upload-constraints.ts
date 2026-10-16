/**
 * Upload limits shared by the upload/study routes (enforced) and the file
 * pickers (shown to the user). Client-safe: no Node imports.
 */

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Converted by the Python worker (pdfplumber / MarkItDown). */
export const BINARY_EXTENSIONS = [".pdf", ".docx", ".pptx", ".xlsx", ".xls"] as const;

/** Readable as text even when the worker is unavailable. */
export const TEXT_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
] as const;

export const UPLOAD_ACCEPT = [...BINARY_EXTENSIONS, ...TEXT_EXTENSIONS].join(",");

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function isTextExtension(ext: string): boolean {
  return (TEXT_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedExtension(ext: string): boolean {
  return isTextExtension(ext) || (BINARY_EXTENSIONS as readonly string[]).includes(ext);
}

/** Client-side pre-check; the server repeats it. Returns an error message or null. */
export function validateUploadFile(file: { name: string; size: number }): string | null {
  const ext = fileExtension(file.name);
  if (!isSupportedExtension(ext)) {
    return `Unsupported file type: ${ext || "(none)"}. Supported: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, HTML.`;
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `The file is larger than ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}
