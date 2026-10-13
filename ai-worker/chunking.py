"""Structure-aware text chunking for the retrieval pipeline.

Splits cleaned Markdown into chunks of roughly ``max_words`` words while
keeping meaningful units intact:

* paragraphs / bullet lists / table rows keep their line breaks
  (the previous implementation joined every word with a single space, which
  destroyed code blocks, bullets and table rows),
* fenced code blocks are kept whole when they fit,
* oversized units are split on lines, then sentences, then words,
* the heading path ("Section > Subsection") is prepended to every chunk so a
  chunk stays self-describing and the section terms take part in TF-IDF,
* the tail of the previous chunk (whole units, at most ``overlap_words``) is
  repeated at the start of the next one.
"""

from __future__ import annotations

import re

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
_FENCE_RE = re.compile(r"^\s*```")


def _wc(text: str) -> int:
    return len(text.split())


def _split_units(text: str) -> list[dict]:
    """Split text into atomic units: heading | code | block (paragraph/list/table)."""
    units: list[dict] = []
    buf: list[str] = []
    code: list[str] | None = None

    def flush() -> None:
        if buf:
            units.append({"kind": "block", "text": "\n".join(buf).strip("\n")})
            buf.clear()

    for line in text.split("\n"):
        if code is not None:
            code.append(line)
            if _FENCE_RE.match(line):
                units.append({"kind": "code", "text": "\n".join(code)})
                code = None
            continue
        if _FENCE_RE.match(line):
            flush()
            code = [line]
            continue
        m = _HEADING_RE.match(line)
        if m:
            flush()
            units.append({"kind": "heading", "level": len(m.group(1)), "text": m.group(2)})
        elif not line.strip():
            flush()
        else:
            buf.append(line)
    if code is not None:  # unterminated fence
        units.append({"kind": "code", "text": "\n".join(code)})
    flush()
    return [u for u in units if u["text"].strip()]


def _split_oversized(text: str, max_words: int) -> list[str]:
    """Break a too-long unit on lines, then sentences, then words."""
    if _wc(text) <= max_words:
        return [text]
    pieces: list[str] = []
    for line in text.split("\n"):
        if _wc(line) <= max_words:
            pieces.append(line)
            continue
        sentences = re.split(r"(?<=[.!?])\s+", line)
        for s in sentences:
            if _wc(s) <= max_words:
                pieces.append(s)
            else:
                w = s.split()
                pieces.extend(" ".join(w[i : i + max_words]) for i in range(0, len(w), max_words))
    # re-pack consecutive pieces up to max_words
    out: list[str] = []
    cur: list[str] = []
    n = 0
    for p in pieces:
        pw = _wc(p)
        if cur and n + pw > max_words:
            out.append("\n".join(cur))
            cur, n = [], 0
        cur.append(p)
        n += pw
    if cur:
        out.append("\n".join(cur))
    return out


def chunk_text(text: str, max_words: int = 150, overlap_words: int = 20) -> list[dict]:
    """Split text into overlapping, structure-preserving chunks.

    Returns:
        List of dicts with ``chunk_index``, ``content``, ``word_count`` and
        ``section`` (heading path, "" if none). ``word_count`` counts the body
        only, not the prepended heading path. Empty list for empty input.
    """
    if not text or not text.strip():
        return []

    heading_stack: list[tuple[int, str]] = []
    # each body item: (text, section_path_at_that_point)
    items: list[tuple[str, str]] = []

    def path() -> str:
        # Markdown heading lines ("# A\n## B"): prepended verbatim to chunks
        return "\n".join("#" * lvl + " " + h for lvl, h in heading_stack)

    for u in _split_units(text):
        if u["kind"] == "heading":
            while heading_stack and heading_stack[-1][0] >= u["level"]:
                heading_stack.pop()
            heading_stack.append((u["level"], u["text"]))
            continue
        for piece in _split_oversized(u["text"], max_words):
            items.append((piece, path()))

    # a document that is only headings still deserves one chunk
    if not items:
        return [{"chunk_index": 0, "content": text.strip(), "word_count": _wc(text), "section": ""}]

    chunks: list[dict] = []
    cur: list[tuple[str, str]] = []
    cur_words = 0
    fresh = False  # cur holds at least one unit not yet emitted

    def emit() -> None:
        section = cur[0][1]
        body = "\n\n".join(t for t, _ in cur)
        content = f"{section}\n\n{body}" if section else body
        chunks.append(
            {
                "chunk_index": len(chunks),
                "content": content,
                "word_count": _wc(body),
                "section": " > ".join(
                    line.lstrip("#").strip() for line in section.split("\n") if line
                ),
            }
        )

    for text_i, sec in items:
        w = _wc(text_i)
        section_changed = bool(cur) and sec != cur[-1][1] and cur_words >= max_words * 0.5
        if cur and (cur_words + w > max_words or section_changed):
            emit()
            tail: list[tuple[str, str]] = []
            tw = 0
            if not section_changed and overlap_words > 0:
                # overlap: reuse trailing whole units within the budget ...
                for prev in reversed(cur):
                    pw = _wc(prev[0])
                    if tw + pw > overlap_words:
                        break
                    tail.insert(0, prev)
                    tw += pw
                # ... or, if the last unit is itself too big, its last words
                last_text, last_sec = cur[-1]
                if not tail and not last_text.lstrip().startswith("```"):
                    words = last_text.split()[-overlap_words:]
                    tail, tw = [(" ".join(words), last_sec)], len(words)
            cur, cur_words, fresh = tail, tw, False
        cur.append((text_i, sec))
        cur_words += w
        fresh = True

    if cur and fresh:
        emit()
    return chunks


def process_document(text: str, max_words: int = 150, overlap_words: int = 20) -> list[dict]:
    """Pipeline: clean_text -> chunk_text."""
    from preprocessing import clean_text

    return chunk_text(clean_text(text), max_words=max_words, overlap_words=overlap_words)
