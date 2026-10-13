"""Document extraction dispatcher.

* PDF  -> ``pdf_extractor`` (pdfplumber, structure aware); MarkItDown is only
          a fallback when the PDF yields (almost) no text layer.
* other formats (DOCX, PPTX, XLSX, HTML, ...) -> MarkItDown.
* plain text (txt/md/csv/json/...) -> read directly (no conversion needed).

Post-processing is deliberately NON-destructive (``normalize_text``): it never
rewrites words and never drops lines. An earlier "artifact cleaner" that
de-duplicated words/lines silently turned "menganalisis" into "is" and removed
repeated code lines, so content-changing heuristics must not live here.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

PLAIN_TEXT_EXTS = {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log", ".rst"}

# A PDF page without a text layer (scan) should not pass as "extracted".
_MIN_CHARS_PER_PAGE = 20


class ExtractionError(Exception):
    """Raised on extraction failure."""


def normalize_text(text: str) -> str:
    """Non-destructive normalization: encoding noise and whitespace only."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x0c", "\n\n")
    # zero-width chars, soft hyphen, BOM, NBSP -> regular space
    text = re.sub(r"[​‌‍⁠﻿­]", "", text)
    text = text.replace(" ", " ")

    out: list[str] = []
    in_code = False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            in_code = not in_code
        line = line.rstrip()
        if not in_code:
            # MarkItDown/pdf often emits justified text with runs of spaces
            indent = re.match(r" *", line).group(0)
            line = indent + re.sub(r" {2,}", " ", line[len(indent):])
        out.append(line)
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_pdf_markitdown(file_path: str) -> str:
    """MarkItDown conversion (used for non-PDF formats and as a PDF fallback)."""
    from markitdown import MarkItDown

    return MarkItDown().convert(file_path).markdown


def extract_pdf_pdfplumber(file_path: str) -> str:
    from pdf_extractor import extract_pdf

    return extract_pdf(file_path)


def _page_count(file_path: str) -> int:
    try:
        import pdfplumber

        with pdfplumber.open(file_path) as pdf:
            return max(1, len(pdf.pages))
    except Exception:
        return 1


def extract_document(file_path: str, original_filename: str | None = None) -> str:
    """Extract text from *file_path* as normalized Markdown.

    ``original_filename`` lets callers (whose temp file may lack an extension)
    pass the real name; if neither has a usable extension, PDFs are still
    detected by their ``%PDF-`` magic bytes.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if not path.is_file():
        raise ValueError(f"Not a file: {file_path}")

    ext = (Path(original_filename).suffix if original_filename else path.suffix).lower()
    if not ext or ext == ".bin":
        with open(path, "rb") as fh:
            if fh.read(5) == b"%PDF-":
                ext = ".pdf"

    if ext in PLAIN_TEXT_EXTS:
        raw = path.read_bytes()
        for enc in ("utf-8-sig", "utf-16", "cp1252"):
            try:
                text = normalize_text(raw.decode(enc))
                break
            except UnicodeError:
                continue
        else:
            raise ExtractionError(f"Cannot decode text file: {file_path}")
        if not text:
            raise ExtractionError(f"File is empty: {file_path}")
        return text

    if ext == ".pdf":
        try:
            text = normalize_text(extract_pdf_pdfplumber(file_path))
        except Exception as e:  # corrupt structure etc. -> try MarkItDown
            print(f"pdfplumber extraction failed: {e}; falling back to MarkItDown")
            text = ""
        if len(text) >= _MIN_CHARS_PER_PAGE * _page_count(file_path) * 0.25:
            return text
        # (almost) no text layer -> try MarkItDown before giving up
        try:
            fallback = normalize_text(extract_pdf_markitdown(file_path))
        except Exception as e:
            raise ExtractionError(f"Extraction failed for {file_path}: {e}") from e
        if len(fallback) > len(text):
            text = fallback
        if not text:
            raise ExtractionError(
                "PDF has no extractable text layer (scanned/image-only PDF?). "
                "OCR is not supported."
            )
        return text

    try:
        text = normalize_text(extract_pdf_markitdown(file_path))
    except Exception as e:
        raise ExtractionError(f"Extraction failed for {file_path}: {e}") from e
    if not text:
        raise ExtractionError(f"No extraction method produced output: {file_path}")
    return text
