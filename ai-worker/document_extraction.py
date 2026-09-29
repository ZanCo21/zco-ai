"""Enhanced document extraction with layout-aware PDF handling.

Uses pdfplumber for PDFs (better structure preservation) and MarkItDown
for other formats. Includes post-processing to clean extraction artifacts.
"""

from __future__ import annotations

import re
from pathlib import Path


class ExtractionError(Exception):
    """Raised on extraction failure."""
    pass


def extract_pdf_pdfplumber(file_path: str) -> str:
    """Extract PDF text using pdfplumber (layout-aware).

    pdfplumber preserves text structure better than basic PDF extractors,
    especially for multi-column layouts and tables.

    Args:
        file_path: Path to PDF file.

    Returns:
        Extracted text as markdown-like format.

    Raises:
        ImportError: pdfplumber not installed.
        Exception: Extraction failed.
    """
    import pdfplumber

    text_parts = []

    with pdfplumber.open(file_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text with layout preservation
            text = page.extract_text()

            if text:
                text_parts.append(text)

    return "\n\n".join(text_parts)


def extract_pdf_markitdown(file_path: str) -> str:
    """Extract using MarkItDown (fallback for complex PDFs).

    Args:
        file_path: Path to file.

    Returns:
        Extracted markdown text.

    Raises:
        Exception: Extraction failed.
    """
    from markitdown import MarkItDown

    md = MarkItDown()
    result = md.convert(file_path)
    return result.markdown


def clean_extraction(text: str) -> str:
    """Post-process extracted text to fix common artifacts.

    Fixes:
    - Duplicate word patterns (e.g., "HewHewan" → "Hewan")
    - Character corruption artifacts
    - Excessive whitespace and line duplication
    - Malformed list markers

    Args:
        text: Raw extracted text.

    Returns:
        Cleaned text.
    """
    if not text or not text.strip():
        return ""

    lines = []
    seen_lines = set()

    for line in text.split("\n"):
        line = line.rstrip()

        if not line:
            lines.append("")
            continue

        # Skip exact duplicates (common artifact)
        if line in seen_lines:
            continue
        seen_lines.add(line)

        # Fix duplicate word patterns: "HewHewan" → "Hewan"
        # Match pattern where word starts repeated at split point
        def fix_duplicate_words(m):
            word = m.group(1)
            half = len(word) // 2
            # Check if first half matches end of second half
            if word[:half].lower() == word[half:].lower():
                return word[half:]
            return word

        line = re.sub(
            r"\b([a-zA-Z]{4,})([a-zA-Z]{2,})\b",
            lambda m: m.group(2) if m.group(1).lower().endswith(m.group(2).lower()) else m.group(0),
            line,
        )

        # Fix character corruption: "dak" → "tidak" in specific contexts
        line = re.sub(r"\bdak\s+(memiliki|punya|adalah)", r"tidak \1", line)
        line = re.sub(r"\bpas\s+(mengalami|dapat)", r"dapat \1", line)

        # Clean up malformed list markers: "a)a)" → "a)"
        line = re.sub(r"([a-zA-Z]\))\1+", r"\1", line)
        line = re.sub(r"([a-zA-Z]\))\s+\1", r"\1", line)

        # Collapse excessive spaces
        line = re.sub(r"  +", " ", line)

        lines.append(line)

    # Remove consecutive blank lines (max 2)
    result = []
    blank_count = 0
    for line in lines:
        if not line.strip():
            blank_count += 1
            if blank_count <= 2:
                result.append(line)
        else:
            blank_count = 0
            result.append(line)

    return "\n".join(result).strip()


def extract_document(file_path: str) -> str:
    """Extract text from document file with intelligent format detection.

    Strategy:
    1. For PDFs: Try pdfplumber first (layout-aware), fallback to MarkItDown
    2. For other formats: Use MarkItDown
    3. Post-process to clean extraction artifacts

    Args:
        file_path: Path to document file.

    Returns:
        Extracted and cleaned text.

    Raises:
        FileNotFoundError: File does not exist.
        ExtractionError: Extraction failed for all methods.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if not path.is_file():
        raise ValueError(f"Not a file: {file_path}")

    is_pdf = path.suffix.lower() == ".pdf"

    # Try PDF extraction first for .pdf files
    if is_pdf:
        try:
            text = extract_pdf_pdfplumber(file_path)
            if text and text.strip():
                cleaned = clean_extraction(text)
                if cleaned:
                    return cleaned
        except ImportError:
            pass  # pdfplumber not available, try MarkItDown
        except Exception as e:
            print(f"pdfplumber extraction failed: {e}, trying fallback...")

    # Fallback to MarkItDown
    try:
        text = extract_pdf_markitdown(file_path)
        if text and text.strip():
            cleaned = clean_extraction(text)
            if cleaned:
                return cleaned
    except Exception as e:
        raise ExtractionError(f"Extraction failed for {file_path}: {e}") from e

    raise ExtractionError(f"No extraction method produced output: {file_path}")
