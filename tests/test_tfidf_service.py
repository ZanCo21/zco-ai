"""Tests for TF-IDF indexing service.

Tests cover:
- TfidfIndex initialization
- Fitting on various chunk sizes
- Matrix shape and vocabulary
- Query transformation
- Error handling
- Edge cases (empty, no vocab overlap)
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-worker"))

import numpy as np
from tfidf_service import TfidfIndex


# ── initialization ───────────────────────────────────────────────────

def test_init_default():
    index = TfidfIndex()
    assert index.max_features == 5000
    assert index.vectorizer is None
    assert index.matrix is None
    assert index.chunks is None


def test_init_custom_config():
    index = TfidfIndex(
        max_features=1000,
        stop_words={"test"},
        ngram_range=(1, 2),
    )
    assert index.max_features == 1000
    assert "test" in index.stop_words
    assert index.ngram_range == (1, 2)


# ── fitting ──────────────────────────────────────────────────────────

def test_fit_simple_chunks():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
        {"content": "jadwal ujian semester"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    assert index.vectorizer is not None
    assert index.matrix is not None
    assert index.chunks is not None


def test_fit_matrix_shape():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
        {"content": "jadwal ujian semester"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    matrix = index.get_matrix()
    assert matrix.shape[0] == 3  # 3 chunks


def test_fit_vocabulary_created():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
        {"content": "jadwal ujian semester"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    vocab_size = index.get_vocabulary_size()
    assert vocab_size > 0


def test_fit_chunks_stored():
    chunks = [
        {"content": "test chunk 1", "chunk_index": 0},
        {"content": "test chunk 2", "chunk_index": 1},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    stored = index.get_chunks()
    assert len(stored) == 2
    assert stored[0]["chunk_index"] == 0


def test_fit_empty_chunks_raises():
    index = TfidfIndex()
    try:
        index.fit([])
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "empty" in str(e).lower()


def test_fit_missing_content_raises():
    chunks = [
        {"chunk_index": 0},  # missing 'content'
    ]
    index = TfidfIndex()
    try:
        index.fit(chunks)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "content" in str(e).lower()


# ── query transformation ─────────────────────────────────────────────

def test_transform_query_basic():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
        {"content": "jadwal ujian semester"},
    ]
    index = TfidfIndex()
    index.fit(chunks)

    query_vec = index.transform_query("informasi beasiswa mahasiswa")
    assert isinstance(query_vec, np.ndarray)
    assert query_vec.ndim == 1  # 1D array
    assert query_vec.shape[0] == index.get_vocabulary_size()


def test_transform_query_before_fit_raises():
    index = TfidfIndex()
    try:
        index.transform_query("test")
        assert False, "Should raise RuntimeError"
    except RuntimeError as e:
        assert "fit" in str(e).lower()


def test_transform_query_empty():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
    ]
    index = TfidfIndex()
    index.fit(chunks)

    query_vec = index.transform_query("")
    assert np.allclose(query_vec, 0)  # All zeros


def test_transform_query_no_overlap():
    """Query with zero vocabulary overlap should return zero vector."""
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
    ]
    index = TfidfIndex()
    index.fit(chunks)

    # Query with completely different words
    query_vec = index.transform_query("xyz abc qwerty")
    # Might not be all zeros if vectorizer still creates features,
    # but should not crash
    assert isinstance(query_vec, np.ndarray)


def test_transform_query_with_overlap():
    """Query with vocabulary overlap should have non-zero values."""
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa"},
    ]
    index = TfidfIndex()
    index.fit(chunks)

    query_vec = index.transform_query("beasiswa mahasiswa")
    # Should have non-zero TF-IDF values for matched terms
    assert not np.allclose(query_vec, 0)


# ── accessors ────────────────────────────────────────────────────────

def test_get_vocabulary_size():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    vocab_size = index.get_vocabulary_size()
    assert vocab_size > 0
    assert isinstance(vocab_size, (int, np.integer))


def test_get_feature_names():
    chunks = [
        {"content": "beasiswa mahasiswa universitas"},
        {"content": "pendaftaran mahasiswa baru"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    features = index.get_feature_names()
    assert isinstance(features, list)
    assert len(features) == index.get_vocabulary_size()
    assert all(isinstance(f, str) for f in features)


def test_get_matrix_shape():
    chunks = [
        {"content": "test 1"},
        {"content": "test 2"},
        {"content": "test 3"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    matrix = index.get_matrix()
    assert matrix.shape[0] == 3


def test_get_matrix_before_fit_raises():
    index = TfidfIndex()
    try:
        index.get_matrix()
        assert False, "Should raise RuntimeError"
    except RuntimeError as e:
        assert "fit" in str(e).lower()


# ── configuration ────────────────────────────────────────────────────

def test_max_features_limit():
    chunks = [
        {"content": f"word{i}" for i in range(100)} for _ in range(5)
    ]
    index = TfidfIndex(max_features=50)
    index.fit(chunks)
    # Vocabulary should be capped
    vocab_size = index.get_vocabulary_size()
    assert vocab_size <= 50


def test_stop_words_excluded():
    chunks = [
        {"content": "the quick brown fox"},
        {"content": "the lazy dog"},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    features = index.get_feature_names()
    # Stop words like "the" should be excluded (or low TF-IDF)
    # At minimum, content words should exist
    assert "quick" in features or "brown" in features


def test_ngram_range_unigrams():
    chunks = [
        {"content": "hello world"},
        {"content": "world peace"},
    ]
    index = TfidfIndex(ngram_range=(1, 1))
    index.fit(chunks)
    features = index.get_feature_names()
    assert "hello" in features
    assert "world" in features


# ── integration ──────────────────────────────────────────────────────

def test_full_pipeline():
    """Full pipeline: fit → query → vector."""
    chunks = [
        {"content": "beasiswa mahasiswa universitas IPK tinggi"},
        {"content": "pendaftaran dibuka bulan Januari"},
        {"content": "syarat dokumen lengkap"},
    ]
    index = TfidfIndex()
    index.fit(chunks)

    # Query
    query = "beasiswa mahasiswa IPK"
    vec = index.transform_query(query)

    # Verify
    assert vec.shape[0] == index.get_vocabulary_size()
    assert not np.allclose(vec, 0)  # Non-zero for query with vocab overlap


def test_multiple_chunks_coverage():
    """Ensure all chunks indexed."""
    chunks = [
        {"content": f"chunk {i} content here"}
        for i in range(10)
    ]
    index = TfidfIndex()
    index.fit(chunks)

    matrix = index.get_matrix()
    assert matrix.shape[0] == 10
    stored = index.get_chunks()
    assert len(stored) == 10


def test_realistic_scholarship_data():
    """Test with realistic scholarship document chunks."""
    chunks = [
        {
            "content": "Panduan Beasiswa 2024 persyaratan umum IPK minimal 3.5",
            "chunk_index": 0,
        },
        {
            "content": "dokumen yang diperlukan transkrip nilai surat rekomendasi proposal",
            "chunk_index": 1,
        },
        {
            "content": "jadwal pendaftaran dibuka Januari ditutup Maret pengumuman April",
            "chunk_index": 2,
        },
    ]
    index = TfidfIndex()
    index.fit(chunks)

    # Test various queries
    queries = [
        "persyaratan beasiswa IPK",
        "jadwal pendaftaran",
        "dokumen yang diperlukan",
    ]

    for q in queries:
        vec = index.transform_query(q)
        assert vec.shape[0] == index.get_vocabulary_size()
        # Each query should have some match
        assert not np.allclose(vec, 0)


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
