"""Minimal HTTP server for the Python AI worker.

Exposes document conversion and text processing endpoints
called by the Next.js backend.
"""

from __future__ import annotations

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

from chunking import process_document
from markitdown_service import MarkItDownError, convert_file
from preprocessing import clean_text


class WorkerHandler(BaseHTTPRequestHandler):
    """Simple JSON API handler."""

    def _send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw) if raw else {}

    # -- routes -------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        try:
            if self.path == "/convert":
                self._handle_convert()
            elif self.path == "/process":
                self._handle_process()
            else:
                self._send_json({"error": "not found"}, 404)
        except Exception:
            traceback.print_exc()
            self._send_json({"error": "internal server error"}, 500)

    def _handle_convert(self) -> None:
        """Convert a file to Markdown via MarkItDown."""
        data = self._read_json()
        file_path = data.get("file_path")
        if not file_path:
            self._send_json({"error": "file_path required"}, 400)
            return
        try:
            markdown = convert_file(file_path)
            self._send_json({"markdown": markdown})
        except FileNotFoundError as e:
            self._send_json({"error": str(e)}, 404)
        except ValueError as e:
            self._send_json({"error": str(e)}, 400)
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def _handle_process(self) -> None:
        """Clean + chunk text. Accepts raw Markdown, returns chunks."""
        data = self._read_json()
        text = data.get("text", "")
        max_words = data.get("max_words", 300)
        overlap_words = data.get("overlap_words", 50)
        chunks = process_document(text, max_words=max_words, overlap_words=overlap_words)
        self._send_json({"chunks": chunks, "total_chunks": len(chunks)})


def main(port: int = 8001) -> None:
    server = HTTPServer(("127.0.0.1", port), WorkerHandler)
    print(f"AI Worker running on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    main(port)
