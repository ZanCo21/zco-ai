import type { ProcessingEvent } from "@/lib/processing-events";

export type SendEvent = (event: ProcessingEvent) => void;

/**
 * Stream `run`'s events as NDJSON. Each `send` is flushed to the client
 * immediately, so the browser sees every backend step as it happens. Errors
 * thrown by `run` must already have been sent as `error` events; anything else
 * becomes a generic error event.
 */
export function ndjsonResponse(run: (send: SendEvent) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SendEvent = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true; // client went away
        }
      };
      try {
        await run(send);
      } catch (error) {
        console.error("Streaming route failed:", error);
        send({
          type: "error",
          stage: "unknown",
          message: error instanceof Error ? error.message : "Processing failed",
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
