"use client";

import { splitNdjson, type ProcessingEvent } from "@/lib/processing-events";

interface StreamRequestOptions {
  url: string;
  body: FormData | Record<string, unknown>;
  /** Fraction (0..1) of the request body sent to the server. */
  onUploadProgress?: (fraction: number) => void;
  onEvent: (event: ProcessingEvent) => void;
  signal?: AbortSignal;
}

export class StreamRequestError extends Error {
  constructor(
    message: string,
    public readonly stage: string
  ) {
    super(message);
    this.name = "StreamRequestError";
  }
}

/**
 * POST to an NDJSON progress route. XMLHttpRequest (not fetch) is used because
 * it reports real upload progress and exposes the response while it streams.
 * Resolves with the `result` payload; rejects with a StreamRequestError that
 * carries the failing stage.
 */
export function streamRequest<T>({
  url,
  body,
  onUploadProgress,
  onEvent,
  signal,
}: StreamRequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let offset = 0;
    let buffer = "";
    let result: { data: T } | null = null;
    let failure: StreamRequestError | null = null;

    const consume = () => {
      const text = xhr.responseText;
      buffer += text.slice(offset);
      offset = text.length;
      const { events, rest } = splitNdjson(buffer);
      buffer = rest;
      for (const event of events) {
        if (event.type === "result") result = { data: event.data as T };
        if (event.type === "error") failure = new StreamRequestError(event.message, event.stage);
        onEvent(event);
      }
    };

    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onUploadProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => onUploadProgress?.(1);
    xhr.onprogress = consume;
    xhr.onload = () => {
      consume();
      if (buffer.trim()) {
        buffer += "\n";
        consume();
      }
      if (failure) return reject(failure);
      if (xhr.status >= 400 && !result) {
        let message = `Request failed (${xhr.status})`;
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          // not JSON
        }
        return reject(new StreamRequestError(message, "upload"));
      }
      if (result) return resolve(result.data);
      reject(new StreamRequestError("The server closed the connection before finishing.", "unknown"));
    };
    xhr.onerror = () =>
      reject(new StreamRequestError("Network error: the application server is not reachable.", "upload"));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    if (body instanceof FormData) {
      xhr.send(body);
    } else {
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(body));
    }
  });
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
