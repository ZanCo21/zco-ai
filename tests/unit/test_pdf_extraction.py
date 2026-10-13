"""Extraction regression tests on the real EDA.pdf (the file that exposed the bugs).

Each test pins a failure observed in the original pipeline:
  * "menganalisis"/"Analisis" were rewritten to "is" by an over-eager cleaner
  * repeated lines (code, headers) were silently dropped
  * table cells of different columns were interleaved
  * page numbers leaked into the text
  * PDFs uploaded through a temp file without extension skipped pdfplumber
"""

import re
import shutil

import pytest

from document_extraction import ExtractionError, extract_document, normalize_text


def test_words_are_not_corrupted(eda_markdown):
    # source PDF contains "analisis" 18x (Analisis, menganalisis, Menganalisis, ...)
    assert len(re.findall(r"analisis", eda_markdown, flags=re.I)) >= 18
    assert "Mahasiswa mampu menganalisis keberadaan outliers" in eda_markdown
    assert "Menganalisis Pola dan Korelasi" in eda_markdown
    # the old cleaner produced these fragments
    assert "mampu is" not in eda_markdown
    assert "\nis konteks" not in eda_markdown


def test_repeated_lines_are_kept(eda_markdown):
    # every code listing starts with its own imports / headings; none may be de-duplicated
    assert eda_markdown.count("import pandas as pd") >= 2
    assert eda_markdown.count("2. Implementasi Kode") == 4  # as many as in the source PDF


def test_no_page_numbers_leak(eda_markdown):
    assert not [l for l in eda_markdown.splitlines() if re.fullmatch(r"\d{1,2}", l.strip())]


def test_table_rows_are_self_describing(eda_markdown):
    mcar = next(l for l in eda_markdown.splitlines() if "MCAR (Missing Completely at Random)" in l and l.startswith("- Tipe"))
    # definition, example and strategy of ONE row stay on ONE line, with headers
    assert "Contoh Kasus Nyata: Sensor IoT mati" in mcar
    assert "Listwise Deletion" in mcar and "< 5%" in mcar


def test_table_row_continued_on_next_page_is_merged(eda_markdown):
    mar = next(l for l in eda_markdown.splitlines() if l.startswith("- Tipe Missing: MAR"))
    assert "Multiple Imputation by Chained Equations (MICE)" in mar
    assert not any(l.startswith("- Dampak & Strategi Penanganan: Equations") for l in eda_markdown.splitlines())


def test_table_without_repeated_header_inherits_it(eda_markdown):
    # tabel "Tahap | Pemeriksaan Utama | ..." continues on the next page without header
    row = next(l for l in eda_markdown.splitlines() if "4. Distribusi" in l and l.startswith("- "))
    assert row.startswith("- Tahap: 4. Distribusi")
    assert "Ambang Batas Kritis" in row


def test_troubleshooting_matrix_has_all_ten_rows(eda_markdown):
    rows = [l for l in eda_markdown.splitlines() if re.match(r"- No: \d+ \| Gejala", l)]
    assert len(rows) == 10


def test_code_blocks_keep_lines_and_indentation(eda_markdown):
    assert "```python" in eda_markdown
    assert "train_test_split(\n    X, y, test_size=0.2, random_state=42, stratify=y\n)" in eda_markdown


def test_headings_detected(eda_markdown):
    assert re.search(r"^#{2,3} TAHAP 1: Feature Sanity Check", eda_markdown, flags=re.M)


def test_extension_less_temp_file_still_uses_pdf_extractor(eda_pdf, eda_markdown, tmp_path):
    """Upload route used to save the temp file without extension."""
    noext = tmp_path / "3f2b9c1e-0000-4000-8000-000000000000"
    shutil.copy(eda_pdf, noext)
    assert extract_document(str(noext)) == eda_markdown


def test_original_filename_overrides_missing_extension(eda_pdf, eda_markdown, tmp_path):
    f = tmp_path / "upload.bin"
    shutil.copy(eda_pdf, f)
    assert extract_document(str(f), original_filename="EDA.pdf") == eda_markdown


def test_plain_text_is_read_directly(tmp_path):
    f = tmp_path / "a.txt"
    f.write_text("Baris satu\n\nBaris satu\nmenganalisis data", encoding="utf-8")
    out = extract_document(str(f))
    assert out.count("Baris satu") == 2  # duplicates kept
    assert "menganalisis data" in out


def test_empty_text_file_raises(tmp_path):
    f = tmp_path / "empty.txt"
    f.write_text("   \n", encoding="utf-8")
    with pytest.raises(ExtractionError):
        extract_document(str(f))


def test_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        extract_document("does-not-exist.pdf")


def test_normalize_text_is_non_destructive():
    src = "analisis   data\nanalisis   data\n\n\n\nmenganalisis\u00ad\u200b  X"
    out = normalize_text(src)
    assert out.splitlines()[:2] == ["analisis data", "analisis data"]  # no dedupe, spaces collapsed
    assert "menganalisis X" in out  # soft hyphen / zero-width removed, word intact
    assert "\n\n\n" not in out


def test_normalize_text_keeps_code_indentation():
    src = "```python\nif x:\n    y  =  1\n```"
    assert normalize_text(src) == src
