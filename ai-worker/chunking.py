"""Text chunking for the retrieval pipeline.

Splits cleaned Markdown into overlapping word-based chunks,
respecting paragraph boundaries and carrying heading context
into each chunk so retrieval doesn't lose section information.
"""

from __future__ import annotations

import re


def chunk_text(
    text: str,
    max_words: int = 300,
    overlap_words: int = 50,
) -> list[dict]:
    """Split text into overlapping chunks for TF-IDF indexing.

    Strategy:
    1. Split on paragraph boundaries (double newline).
    2. Accumulate paragraphs until *max_words* is reached.
    3. Emit a chunk, then back up by *overlap_words* for the next one.
    4. Markdown headings (lines starting with #) are tracked; the most
       recent heading is prepended to every chunk that doesn't already
       start with one, so retrieval context is preserved.

    Args:
        text: Cleaned text (output of ``clean_text``).
        max_words: Soft maximum words per chunk.
        overlap_words: Words to repeat between consecutive chunks.

    Returns:
        List of chunk dicts with keys ``chunk_index``, ``content``,
        ``word_count``.  Empty list for empty/whitespace-only input.
    """
    if not text or not text.strip():
        return []

    paragraphs = _split_paragraphs(text)
    if not paragraphs:
        return []

    # Flatten to (word, paragraph_break_after, heading_context) stream
    words: list[str] = []
    para_breaks: set[int] = set()  # indices after which a para break exists
    heading_at: dict[int, str] = {}  # word-index → heading text active from here

    current_heading: str = ""
    for para in paragraphs:
        stripped = para.strip()
        if not stripped:
            continue
        # detect heading
        if re.match(r"^#{1,6}\s", stripped):
            current_heading = stripped

        start = len(words)
        if current_heading and start not in heading_at:
            heading_at[start] = current_heading

        para_words = stripped.split()
        words.extend(para_words)
        para_breaks.add(len(words) - 1)

    if not words:
        return []

    chunks: list[dict] = []
    idx = 0
    chunk_index = 0

    while idx < len(words):
        end = min(idx + max_words, len(words))

        # try to break at paragraph boundary
        if end < len(words):
            best_break = _find_para_break(para_breaks, idx, end)
            if best_break is not None:
                end = best_break + 1  # include the word at break

        chunk_words = words[idx:end]
        content = " ".join(chunk_words)

        # prepend heading context if chunk doesn't start with one
        heading = _active_heading(heading_at, idx)
        if heading and not re.match(r"^#{1,6}\s", content):
            content = heading + "\n\n" + content

        wc = len(chunk_words)
        if wc > 0:
            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "content": content,
                    "word_count": wc,
                }
            )
            chunk_index += 1

        if end >= len(words):
            break

        # advance with overlap
        idx = max(end - overlap_words, idx + 1)

    return chunks


def process_document(text: str, max_words: int = 300, overlap_words: int = 50) -> list[dict]:
    """Pipeline: clean_text → chunk_text.

    Convenience wrapper that imports preprocessing internally to
    avoid circular deps at module level.

    Args:
        text: Raw Markdown string.
        max_words: Soft max words per chunk.
        overlap_words: Overlap between chunks.

    Returns:
        List of chunk dicts.
    """
    from preprocessing import clean_text

    cleaned = clean_text(text)
    return chunk_text(cleaned, max_words=max_words, overlap_words=overlap_words)


# -- helpers ----------------------------------------------------------


def _split_paragraphs(text: str) -> list[str]:
    """Split text on double-newline boundaries."""
    return re.split(r"\n{2,}", text)


def _find_para_break(breaks: set[int], start: int, end: int) -> int | None:
    """Find the latest paragraph break index in [start, end)."""
    best = None
    # search backwards from end for efficiency-enough at these sizes
    for i in range(end - 1, start - 1, -1):
        if i in breaks:
            best = i
            break
    return best


def _active_heading(heading_at: dict[int, str], pos: int) -> str:
    """Return the heading active at word-position *pos*."""
    active = ""
    for k in sorted(heading_at):
        if k <= pos:
            active = heading_at[k]
        else:
            break
    return active
