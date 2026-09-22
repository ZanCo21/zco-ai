"""Tests for cosine similarity retrieval service.

Tests cover:
- Ranking by relevance
- Top-k selection
- Edge cases (empty query, no overlap, invalid top_k)
- Integration with TfidfIndex
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-worker"))

from tfidf_service import TfidfIndex
from retrieval import RetrieverService, retrieve


# ── setup ────────────────────────────────────────────────────────────

def get_test_index():
    """Create a test TfidfIndex with 4 chunks."""
    chunks = [
        {
            "chunk_index": 0,
            "content": "beasiswa mahasiswa universitas",
            "word_count": 3,
        },
        {
            "chunk_index": 1,
            "content": "pendaftaran mahasiswa baru",
            "word_count": 3,
        },
        {
            "chunk_index": 2,
            "content": "jadwal ujian semester",
            "word_count": 3,
        },
        {
            "chunk_index": 3,
            "content": "syarat beasiswa mahasiswa",
            "word_count": 3,
        },
    ]
    index = TfidfIndex()
    index.fit(chunks)
    return index


# ── initialization ───────────────────────────────────────────────────

def test_init_requires_fitted_index():
    index = TfidfIndex()
    try:
        RetrieverService(index)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "fitted" in str(e).lower()


def test_init_with_fitted_index():
    index = get_test_index()
    service = RetrieverService(index)
    assert service.index is not None


# ── ranking ──────────────────────────────────────────────────────────

def test_ranking_relevance():
    """Chunks about beasiswa should rank higher for beasiswa query."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("syarat beasiswa", top_k=10)

    # First result should be most relevant
    assert len(results) > 0
    assert "beasiswa" in results[0]["content"].lower()

    # Chunks with "beasiswa" should have higher similarity
    beasiswa_sims = [
        r["similarity"] for r in results
        if "beasiswa" in r["content"].lower()
    ]
    ujian_sims = [
        r["similarity"] for r in results
        if "ujian" in r["content"].lower()
    ]

    if beasiswa_sims and ujian_sims:
        assert min(beasiswa_sims) > max(ujian_sims)


def test_ranking_order():
    """Results should be ordered from highest to lowest similarity."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("beasiswa mahasiswa", top_k=10)

    for i in range(len(results) - 1):
        assert results[i]["similarity"] >= results[i + 1]["similarity"]


# ── top_k ────────────────────────────────────────────────────────────

def test_top_k_limit():
    """Should return at most top_k results."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("mahasiswa", top_k=2)
    assert len(results) <= 2


def test_top_k_full_retrieval():
    """Should return all chunks when relevant."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("mahasiswa", top_k=10)
    # "mahasiswa" appears in chunks 0, 1, 3
    assert len(results) >= 3


def test_top_k_exceeds_chunks():
    """top_k > num_chunks should return all chunks."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("mahasiswa", top_k=100)
    assert len(results) <= 4  # Only 4 chunks total


def test_top_k_one():
    """top_k=1 should return single best result."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("jadwal ujian", top_k=1)
    assert len(results) == 1
    assert "jadwal" in results[0]["content"] or "ujian" in results[0]["content"]


def test_top_k_invalid_raises():
    """top_k <= 0 should raise ValueError."""
    index = get_test_index()
    service = RetrieverService(index)

    try:
        service.retrieve("test", top_k=0)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "top_k" in str(e).lower() and "0" in str(e)

    try:
        service.retrieve("test", top_k=-1)
        assert False, "Should raise ValueError"
    except ValueError:
        pass


# ── empty/no overlap ─────────────────────────────────────────────────

def test_empty_query():
    """Empty query should return empty list (no crash)."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("", top_k=10)
    assert results == []

    results = service.retrieve("   ", top_k=10)
    assert results == []


def test_query_no_vocab_overlap():
    """Query with no vocabulary overlap should return empty list."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("xyz abc qwerty", top_k=10)
    # Should be empty or all zeros (no overlap means all similarities ~0)
    assert len(results) == 0 or all(r["similarity"] < 0.01 for r in results)


def test_query_whitespace_only():
    """Whitespace-only query should return empty list."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("\n\t  ", top_k=10)
    assert results == []


# ── result structure ─────────────────────────────────────────────────

def test_result_has_required_fields():
    """Each result should have required fields."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("beasiswa", top_k=10)

    for r in results:
        assert "chunk_index" in r
        assert "content" in r
        assert "similarity" in r
        assert isinstance(r["chunk_index"], int)
        assert isinstance(r["content"], str)
        assert isinstance(r["similarity"], float)


def test_result_preserves_metadata():
    """Results should preserve chunk metadata."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("beasiswa", top_k=10)

    for r in results:
        assert "word_count" in r
        assert isinstance(r["word_count"], int)


def test_similarity_in_valid_range():
    """Similarity should be between 0 and 1."""
    index = get_test_index()
    service = RetrieverService(index)

    results = service.retrieve("beasiswa mahasiswa", top_k=10)

    for r in results:
        assert 0 <= r["similarity"] <= 1


# ── convenience function ─────────────────────────────────────────────

def test_retrieve_function():
    """Module-level retrieve() function should work."""
    index = get_test_index()

    results = retrieve(index, "beasiswa", top_k=2)
    assert len(results) <= 2
    assert all("chunk_index" in r for r in results)


# ── realistic scenario ───────────────────────────────────────────────

def test_realistic_scholarship_retrieval():
    """Test with realistic scholarship document chunks."""
    chunks = [
        {
            "chunk_index": 0,
            "content": "Panduan Beasiswa 2024 persyaratan umum IPK minimal 3.5",
            "word_count": 8,
        },
        {
            "chunk_index": 1,
            "content": "dokumen yang diperlukan transkrip nilai surat rekomendasi proposal",
            "word_count": 10,
        },
        {
            "chunk_index": 2,
            "content": "jadwal pendaftaran dibuka Januari ditutup Maret pengumuman April",
            "word_count": 10,
        },
        {
            "chunk_index": 3,
            "content": "besaran beasiswa biaya kuliah penuh tunjangan hidup bulanan",
            "word_count": 9,
        },
    ]

    index = TfidfIndex()
    index.fit(chunks)
    service = RetrieverService(index)

    # Query about requirements
    results = service.retrieve("persyaratan IPK beasiswa", top_k=2)
    assert len(results) > 0
    # First result should be about requirements
    assert "persyaratan" in results[0]["content"] or "ipk" in results[0]["content"]

    # Query about timeline
    results = service.retrieve("jadwal pendaftaran kapan", top_k=2)
    assert len(results) > 0
    assert "jadwal" in results[0]["content"] or "januari" in results[0]["content"]


# ── multiple queries ─────────────────────────────────────────────────

def test_multiple_queries_same_service():
    """RetrieverService should handle multiple queries."""
    index = get_test_index()
    service = RetrieverService(index)

    q1 = service.retrieve("beasiswa", top_k=2)
    q2 = service.retrieve("jadwal", top_k=2)
    q3 = service.retrieve("mahasiswa", top_k=2)

    assert len(q1) > 0
    assert len(q2) > 0
    assert len(q3) > 0


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
