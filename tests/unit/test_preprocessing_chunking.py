"""Tests for preprocessing and chunking."""

import sys
import os

# ensure ai-worker is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-worker"))

from preprocessing import clean_text
from chunking import chunk_text, process_document


# ── preprocessing ────────────────────────────────────────────────────

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
    text = "# Title\n\nSome text"
    result = clean_text(text)
    assert result.startswith("# Title")


def test_clean_trailing_spaces():
    text = "hello   \nworld   "
    result = clean_text(text)
    assert "   " not in result


# ── chunking ─────────────────────────────────────────────────────────

def test_chunk_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []
    assert chunk_text(None) == []


def test_chunk_short():
    chunks = chunk_text("Hello world, this is a short text.")
    assert len(chunks) == 1
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["word_count"] > 0
    assert chunks[0]["content"].strip() != ""


def test_chunk_no_empty_chunks():
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


def test_chunk_overlap():
    text = "word " * 200
    chunks = chunk_text(text, max_words=100, overlap_words=30)
    assert len(chunks) >= 2
    # last words of chunk 0 should appear in chunk 1
    words_0 = chunks[0]["content"].split()
    words_1 = chunks[1]["content"].split()
    tail_0 = set(words_0[-30:])
    head_1 = set(words_1[:30])
    # overlap exists (all words are "word" so intersection guaranteed)
    assert len(tail_0 & head_1) > 0


def test_chunk_multiple_paragraphs():
    text = "First paragraph words.\n\nSecond paragraph words.\n\nThird paragraph words."
    chunks = chunk_text(text, max_words=300)
    assert len(chunks) == 1
    assert "First" in chunks[0]["content"]
    assert "Third" in chunks[0]["content"]


def test_chunk_heading_context():
    text = "# Introduction\n\nSome intro text here.\n\n# Methods\n\n" + ("method detail " * 200)
    chunks = chunk_text(text, max_words=50, overlap_words=10)
    # later chunks under "Methods" should carry the heading
    methods_chunks = [c for c in chunks if "# Methods" in c["content"]]
    assert len(methods_chunks) > 0


def test_chunk_long_document():
    text = " ".join(f"word{i}" for i in range(5000))
    chunks = chunk_text(text, max_words=300, overlap_words=50)
    assert len(chunks) > 10
    # all words covered
    all_words = set()
    for c in chunks:
        all_words.update(c["content"].split())
    for i in range(5000):
        assert f"word{i}" in all_words


# ── pipeline ─────────────────────────────────────────────────────────

def test_process_document():
    raw = "# Title\n\n\n\n\nSome   text   here.\n\nAnother paragraph."
    chunks = process_document(raw)
    assert len(chunks) >= 1
    # whitespace cleaned
    assert "   " not in chunks[0]["content"]


def test_process_document_empty():
    assert process_document("") == []


# ── run ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
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
    print(f"\n{passed} passed, {failed} failed, {passed + failed} total")
    sys.exit(1 if failed else 0)
