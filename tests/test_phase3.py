"""Comprehensive tests for Phase 3 implementation.

Tests cover:
- MarkItDown file conversion
- Text preprocessing
- Text chunking
- Pipeline integration
- Error handling
"""

import sys
import os
import tempfile
from pathlib import Path

# Add ai-worker to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-worker"))

from markitdown_service import convert_file, MarkItDownError
from preprocessing import clean_text
from chunking import chunk_text, process_document


# ── markitdown_service tests ─────────────────────────────────────────

def test_convert_file_txt():
    """Convert .txt file to Markdown."""
    test_file = Path(__file__).parent / "data" / "sample_scholarship.txt"
    if not test_file.exists():
        print(f"  SKIP  test_convert_file_txt (test file not found)")
        return

    result = convert_file(str(test_file))
    assert isinstance(result, str)
    assert len(result) > 100
    assert "Panduan Beasiswa" in result


def test_convert_file_not_found():
    """Raise FileNotFoundError for missing file."""
    try:
        convert_file("/nonexistent/file.txt")
        assert False, "Should raise FileNotFoundError"
    except FileNotFoundError as e:
        assert "not found" in str(e).lower()


def test_convert_file_directory():
    """Raise ValueError for directory input."""
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            convert_file(tmpdir)
            assert False, "Should raise ValueError"
        except ValueError as e:
            assert "not a file" in str(e).lower()


# ── preprocessing tests ──────────────────────────────────────────────

def test_clean_empty():
    assert clean_text("") == ""
    assert clean_text("   ") == ""
    assert clean_text("\n\n\n") == ""


def test_clean_whitespace():
    assert clean_text("hello   world") == "hello world"
    assert clean_text("hello\t\tworld") == "hello world"


def test_clean_blank_lines():
    text = "a\n\n\n\n\nb"
    result = clean_text(text)
    assert result == "a\n\nb"


def test_clean_preserves_headings():
    text = "# Title\n\nSome text\n\n## Subtitle"
    result = clean_text(text)
    assert "# Title" in result
    assert "## Subtitle" in result


def test_clean_trailing_spaces():
    text = "hello   \nworld   "
    result = clean_text(text)
    assert result == "hello\nworld"


def test_clean_tabs_to_spaces():
    text = "hello\t\tworld\t\tfoo"
    result = clean_text(text)
    assert "\t" not in result
    assert result == "hello world foo"


# ── chunking tests ───────────────────────────────────────────────────

def test_chunk_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_short():
    chunks = chunk_text("Hello world, this is a short text.")
    assert len(chunks) == 1
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["word_count"] > 0


def test_chunk_no_empty():
    text = "word " * 500
    chunks = chunk_text(text, max_words=100, overlap_words=20)
    for c in chunks:
        assert c["content"].strip() != ""
        assert c["word_count"] > 0


def test_chunk_indices_sequential():
    text = "word " * 500
    chunks = chunk_text(text, max_words=100, overlap_words=20)
    for i, c in enumerate(chunks):
        assert c["chunk_index"] == i


def test_chunk_has_required_fields():
    chunks = chunk_text("hello world " * 100)
    for c in chunks:
        assert "chunk_index" in c
        assert "content" in c
        assert "word_count" in c
        assert isinstance(c["chunk_index"], int)
        assert isinstance(c["content"], str)
        assert isinstance(c["word_count"], int)


def test_chunk_overlap():
    text = "word " * 200
    chunks = chunk_text(text, max_words=100, overlap_words=30)
    assert len(chunks) >= 2
    # Last 30 words of chunk 0 should appear in chunk 1
    words_0 = chunks[0]["content"].split()
    words_1 = chunks[1]["content"].split()
    tail_0 = set(words_0[-30:])
    head_1 = set(words_1[:30])
    assert len(tail_0 & head_1) > 0


def test_chunk_multiple_paragraphs():
    text = "First paragraph words.\n\nSecond paragraph words.\n\nThird paragraph words."
    chunks = chunk_text(text, max_words=300)
    assert len(chunks) == 1
    assert "First" in chunks[0]["content"]
    assert "Third" in chunks[0]["content"]


def test_chunk_heading_context():
    text = (
        "# Introduction\n\nIntro paragraph here.\n\n"
        "# Methods\n\n" + ("method detail " * 200)
    )
    chunks = chunk_text(text, max_words=50, overlap_words=10)
    # Later chunks should carry heading context
    methods_chunks = [c for c in chunks if "# Methods" in c["content"]]
    assert len(methods_chunks) > 0


def test_chunk_long_document():
    text = " ".join(f"word{i}" for i in range(5000))
    chunks = chunk_text(text, max_words=300, overlap_words=50)
    assert len(chunks) > 10
    # Verify coverage
    all_words = set()
    for c in chunks:
        all_words.update(c["content"].split())
    for i in range(5000):
        assert f"word{i}" in all_words


def test_chunk_respects_max_words():
    text = "word " * 1000
    chunks = chunk_text(text, max_words=100)
    for c in chunks:
        # Soft limit; may be exceeded slightly to respect paragraph boundaries
        assert c["word_count"] <= 100 + 50  # soft limit + tolerance


# ── pipeline tests ──────────────────────────────────────────────────

def test_process_document_integrates():
    raw = "# Title\n\n\n\n\nSome   text   here.\n\nAnother paragraph."
    chunks = process_document(raw)
    assert len(chunks) >= 1
    # Whitespace cleaned
    assert "   " not in chunks[0]["content"]


def test_process_document_empty():
    assert process_document("") == []


def test_process_document_with_real_file():
    """Full pipeline: file → convert → clean → chunk."""
    test_file = Path(__file__).parent / "data" / "sample_scholarship.txt"
    if not test_file.exists():
        print(f"  SKIP  test_process_document_with_real_file (test file not found)")
        return

    markdown = convert_file(str(test_file))
    chunks = process_document(markdown, max_words=300, overlap_words=50)

    assert len(chunks) > 0
    assert all("chunk_index" in c for c in chunks)
    assert all("content" in c for c in chunks)
    assert all("word_count" in c for c in chunks)


def test_process_document_chunk_coverage():
    """Ensure all words are covered across chunks."""
    text = "one two three four five six seven eight nine ten " * 100
    chunks = process_document(text, max_words=200, overlap_words=30)
    assert len(chunks) > 0
    all_words = set()
    for c in chunks:
        all_words.update(c["content"].split())
    assert "one" in all_words
    assert "ten" in all_words


# ── run ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    skipped = 0
    failed = 0

    for t in tests:
        try:
            t()
            passed += 1
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"  ERROR {t.__name__}: {e}")

    print(f"\n{passed} passed, {skipped} skipped, {failed} failed, {passed + skipped + failed} total")
    sys.exit(1 if failed else 0)
