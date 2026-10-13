"""Structure-aware PDF extraction (pdfplumber).

Why not plain ``extract_text()`` / MarkItDown for PDFs:

* Tables are flattened row-by-line, so cells of different columns are
  interleaved ("MCAR Probabilitas data Sensor IoT mati Dampak: ...").
* Tables that continue on the next page lose their header row.
* Page numbers leak into the text and sentences are cut at page breaks.
* Code blocks lose their line structure, bullets get detached from text.

This module rebuilds reading order per page and emits Markdown:

* headings (bold / large font)  -> ``##`` / ``###``
* bullets                       -> ``- `` (nested via indentation)
* monospace runs                -> fenced code blocks (line breaks kept)
* tables                        -> one ``- Header: value | Header: value``
                                   line per row (header repeated per row so
                                   each row is self-describing for retrieval)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

BULLET_CHARS = "●○■□◦▪•◆➢➤"
_BULLET_RE = re.compile(rf"^([{re.escape(BULLET_CHARS)}]|[-*–])\s+")
_LIST_ITEM_RE = re.compile(r"^(\d{1,3}[.)]|[A-Za-z][.)])\s+\S")
_SENTENCE_END = (".", "!", "?", ":", ";", "”", '"')
_MONO_HINTS = ("mono", "courier", "consolas", "menlo", "code")

# A page number sits in the top/bottom margin and is a lone integer.
_MARGIN = 70


@dataclass
class _Line:
    text: str
    x0: float
    top: float
    bottom: float
    size: float
    bold: bool
    mono: bool


@dataclass
class _Block:
    kind: str  # heading | para | bullet | code | table
    text: str = ""
    level: int = 0  # heading level or bullet depth
    rows: list[list[str]] = field(default_factory=list)  # table rows
    lang: str = ""


def _is_mono(font: str) -> bool:
    f = font.lower()
    return any(h in f for h in _MONO_HINTS)


def _is_bold(font: str) -> bool:
    f = font.lower()
    return "bold" in f or "black" in f or "heavy" in f


def _lines_from(region) -> list[_Line]:
    """Turn a (cropped) pdfplumber page into typed lines."""
    out: list[_Line] = []
    for ln in region.extract_text_lines(layout=False, strip=True):
        text = ln["text"].strip()
        chars = [c for c in ln["chars"] if c["text"].strip()]
        if not text or not chars:
            continue
        n = len(chars)
        bold = sum(_is_bold(c["fontname"]) for c in chars) / n >= 0.9
        mono = sum(_is_mono(c["fontname"]) for c in chars) / n >= 0.6
        size = sorted(c["size"] for c in chars)[n // 2]
        out.append(_Line(text, ln["x0"], ln["top"], ln["bottom"], size, bold, mono))
    return out


def _clean_cell(cell: str | None) -> str:
    if not cell:
        return ""
    return re.sub(r"\s+", " ", cell.replace("\n", " ")).strip()


def _body_size(pages_lines: list[list[_Line]]) -> float:
    sizes: dict[float, int] = {}
    for lines in pages_lines:
        for ln in lines:
            if not ln.mono:
                s = round(ln.size, 1)
                sizes[s] = sizes.get(s, 0) + len(ln.text)
    return max(sizes, key=sizes.get) if sizes else 12.0


def _lines_to_blocks(lines: list[_Line], body: float, page_h: float) -> list[_Block]:
    blocks: list[_Block] = []
    para: list[str] = []
    code: list[str] = []
    prev: _Line | None = None
    base_x = min((l.x0 for l in lines if not l.mono), default=0.0)

    def flush_para() -> None:
        if para:
            blocks.append(_Block("para", " ".join(para)))
            para.clear()

    def flush_code() -> None:
        if code:
            blocks.append(_Block("code", "\n".join(code)))
            code.clear()

    for ln in lines:
        # page number / running footer: lone integer in the margins
        if re.fullmatch(r"\d{1,4}", ln.text) and (ln.top < _MARGIN or ln.bottom > page_h - _MARGIN):
            continue

        line_gap = (ln.top - prev.bottom) if prev else 0.0
        big_gap = prev is not None and line_gap > body * 0.9

        if ln.mono or (ln.size <= body - 1.5 and re.fullmatch(r"[A-Za-z+#]{2,12}", ln.text)):
            # "Python" language label rendered in a small sans font above code
            if not ln.mono:
                flush_para()
                flush_code()
                blocks.append(_Block("lang", ln.text.lower()))
            else:
                flush_para()
                # keep relative indentation inside code
                indent = " " * max(0, int((ln.x0 - base_x - 10) / 6))
                code.append(indent + ln.text if code else ln.text)
            prev = ln
            continue

        flush_code()

        is_heading = (
            (ln.bold and len(ln.text) <= 110 and not ln.text.endswith((",", ";")))
            or ln.size >= body + 3
        ) and not _BULLET_RE.match(ln.text)
        if is_heading and len(ln.text) <= 140:
            flush_para()
            # merge consecutive heading lines of same style (wrapped title)
            last = blocks[-1] if blocks else None
            if last and last.kind == "heading" and not big_gap and last.level == (1 if ln.size >= body + 3 else 2):
                last.text += " " + ln.text
            else:
                blocks.append(_Block("heading", ln.text, level=1 if ln.size >= body + 3 else 2))
        elif m := _BULLET_RE.match(ln.text):
            flush_para()
            depth = max(0, min(3, round((ln.x0 - base_x - 18) / 36)))
            if BULLET_CHARS.find(m.group(1)) >= 0:
                depth = {"●": 0, "○": 1, "■": 2}.get(m.group(1), depth)
            blocks.append(_Block("bullet", ln.text[m.end():], level=depth))
        elif _LIST_ITEM_RE.match(ln.text):
            flush_para()
            para.append(ln.text)
        else:
            prev_block = blocks[-1] if blocks else None
            if not para and prev_block and prev_block.kind == "bullet" and not big_gap:
                prev_block.text += " " + ln.text  # wrapped bullet line
            elif big_gap and para:
                flush_para()
                para.append(ln.text)
            else:
                para.append(ln.text)
        prev = ln

    flush_para()
    flush_code()

    # attach language labels to the following code block
    merged: list[_Block] = []
    pending_lang = ""
    for b in blocks:
        if b.kind == "lang":
            pending_lang = b.text
        elif b.kind == "code":
            b.lang = pending_lang
            pending_lang = ""
            merged.append(b)
        else:
            merged.append(b)
    return merged


def _extract_page_blocks(page, body_hint: float | None) -> tuple[list[tuple[float, _Block]], list[_Line]]:
    """Return positioned blocks (top, block) for one page."""
    tables = page.find_tables()
    table_bboxes = [t.bbox for t in tables]
    positioned: list[tuple[float, _Block]] = []

    # text regions between tables
    cuts = sorted(table_bboxes, key=lambda b: b[1])
    y = 0.0
    regions: list[tuple[float, float]] = []
    for (_, t_top, _, t_bot) in cuts:
        if t_top - y > 1:
            regions.append((y, t_top))
        y = t_bot
    if page.height - y > 1:
        regions.append((y, page.height))

    all_lines: list[_Line] = []
    region_lines: list[tuple[float, list[_Line]]] = []
    for top, bottom in regions:
        crop = page.crop((0, top, page.width, bottom), strict=False)
        lines = _lines_from(crop)
        region_lines.append((top, lines))
        all_lines.extend(lines)

    for tbl in tables:
        rows = [[_clean_cell(c) for c in row] for row in tbl.extract()]
        rows = [r for r in rows if any(r)]
        if rows:
            positioned.append((tbl.bbox[1], _Block("table", rows=rows)))

    body = body_hint or _body_size([all_lines])
    for top, lines in region_lines:
        for i, b in enumerate(_lines_to_blocks(lines, body, page.height)):
            positioned.append((top + i * 1e-3, b))
    positioned.sort(key=lambda p: p[0])
    return positioned, all_lines


class _Table:
    """Accumulates a (possibly multi-page) table, then renders it row by row."""

    def __init__(self, rows: list[list[str]]):
        self.ncols = max(len(r) for r in rows)
        rows = [r + [""] * (self.ncols - len(r)) for r in rows]
        first = rows[0]
        if self.ncols > 1 and all(first):
            self.header: list[str] | None = first
            self.rows: list[list[str]] = []
            self._add(rows[1:])
        else:
            self.header = None
            self.rows = []
            self._add(rows)

    def _add(self, rows: list[list[str]]) -> None:
        for r in rows:
            r = r + [""] * (self.ncols - len(r))
            # continuation row (leading cells empty): fold into previous row
            if self.rows and not r[0] and any(r) and sum(1 for c in r if c) < self.ncols:
                for i, c in enumerate(r):
                    if c:
                        self.rows[-1][i] = (self.rows[-1][i] + " " + c).strip()
            else:
                self.rows.append(list(r))

    def continue_with(self, rows: list[list[str]]) -> None:
        self._add([r for r in rows])

    def render(self) -> str:
        lines = []
        for r in self.rows:
            if self.header:
                parts = [f"{h}: {c}" for h, c in zip(self.header, r) if c]
            else:
                parts = [c for c in r if c]
            if parts:
                lines.append("- " + " | ".join(parts))
        return "\n".join(lines)


def _fix_encoding_artifacts(text: str) -> str:
    # Combining overline after a letter (X̄) etc. is kept; only drop the
    # private-use / replacement glyphs that carry no information.
    return re.sub(r"[-�]", "", text)


def extract_pdf(file_path: str) -> str:
    """Extract a PDF to Markdown, preserving reading order and structure."""
    import pdfplumber

    out: list = []
    active: _Table | None = None
    last_was_table_at_bottom = False
    carry_para: str | None = None  # paragraph that may continue on next page

    with pdfplumber.open(file_path) as pdf:
        pages = list(pdf.pages)
        # body font size over a sample of pages for stable heading detection
        sample_lines: list[list[_Line]] = []
        for pg in pages[:: max(1, len(pages) // 8)]:
            sample_lines.append(_lines_from(pg))
        body = _body_size(sample_lines)

        for page in pages:
            positioned, _ = _extract_page_blocks(page, body)
            first = True
            for top, blk in positioned:
                if blk.kind == "table":
                    ncols = max(len(r) for r in blk.rows)
                    continues = (
                        last_was_table_at_bottom
                        and first
                        and active is not None
                        and ncols == active.ncols
                        and top < _MARGIN + 30
                    )
                    if carry_para:
                        out.append(carry_para)
                        carry_para = None
                    if continues:
                        # a repeated header row is dropped, not duplicated
                        rows = blk.rows
                        if active.header and [c.lower() for c in rows[0]] == [c.lower() for c in active.header]:
                            rows = rows[1:]
                        active.continue_with(rows)
                    else:
                        active = _Table(blk.rows)
                        out.append(active)
                    last_was_table_at_bottom = True
                    first = False
                    continue

                # a non-table block ends any table adjacency
                if blk.kind != "table":
                    last_was_table_at_bottom = False

                if blk.kind == "para":
                    # sentence split across pages
                    if carry_para is not None and first and blk.text[:1].islower():
                        carry_para = carry_para + " " + blk.text
                    else:
                        if carry_para:
                            out.append(carry_para)
                        carry_para = blk.text
                    first = False
                    continue

                if carry_para:
                    out.append(carry_para)
                    carry_para = None
                first = False

                if blk.kind == "heading":
                    out.append(("#" * (blk.level + 1)) + " " + blk.text)
                elif blk.kind == "bullet":
                    out.append("  " * blk.level + "- " + blk.text)
                elif blk.kind == "code":
                    out.append(f"```{blk.lang}\n{blk.text}\n```")

            # decide whether the last emitted thing was a table touching the page bottom
            if positioned and positioned[-1][1].kind == "table":
                tbl_bottom = max(t.bbox[3] for t in page.find_tables())
                last_was_table_at_bottom = tbl_bottom > page.height - _MARGIN - 40
            else:
                last_was_table_at_bottom = False

    if carry_para:
        out.append(carry_para)

    return _assemble(out)


def _assemble(parts: list) -> str:
    """Join blocks; consecutive bullets / table rows stay on adjacent lines."""
    res: list[str] = []
    prev = ""
    for p in parts:
        p = _fix_encoding_artifacts(p.render() if isinstance(p, _Table) else p).rstrip()
        if not p:
            continue
        both_listy = prev.lstrip().startswith("- ") and p.lstrip().startswith("- ")
        res.append(("\n" if both_listy else "\n\n") + p if res else p)
        prev = p
    return "".join(res).strip()
