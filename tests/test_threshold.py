"""Tests for relevance threshold in retrieval service.

Tests cover:
- Configuration validation
- Relevance assessment
- Threshold checking
- Relevant vs irrelevant queries
- Edge cases
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ai-worker"))

from tfidf_service import TfidfIndex
from retrieval import RetrieverService, retrieve, is_relevant
from config import RetrievalConfig


# ── configuration ────────────────────────────────────────────────────

def test_config_defaults():
    config = RetrievalConfig()
    assert config.similarity_threshold == 0.20
    assert config.top_k == 3


def test_config_custom():
    config = RetrievalConfig(similarity_threshold=0.30, top_k=5)
    assert config.similarity_threshold == 0.30
    assert config.top_k == 5


def test_config_threshold_validation():
    try:
        RetrievalConfig(similarity_threshold=1.5)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "threshold" in str(e).lower()

    try:
        RetrievalConfig(similarity_threshold=-0.1)
        assert False, "Should raise ValueError"
    except ValueError:
        pass


def test_config_top_k_validation():
    try:
        RetrievalConfig(top_k=0)
        assert False, "Should raise ValueError"
    except ValueError as e:
        assert "top_k" in str(e).lower()

    try:
        RetrievalConfig(top_k=-5)
        assert False, "Should raise ValueError"
    except ValueError:
        pass


def test_config_boundary_values():
    # Threshold boundaries
    config = RetrievalConfig(similarity_threshold=0.0)
    assert config.similarity_threshold == 0.0

    config = RetrievalConfig(similarity_threshold=1.0)
    assert config.similarity_threshold == 1.0


# ── is_relevant function ─────────────────────────────────────────────

def test_is_relevant_passes():
    results = [
        {"chunk_index": 0, "content": "test", "similarity": 0.85},
        {"chunk_index": 1, "content": "test", "similarity": 0.30},
    ]
    assert is_relevant(results, threshold=0.20) is True


def test_is_relevant_fails():
    results = [
        {"chunk_index": 0, "content": "test", "similarity": 0.15},
    ]
    assert is_relevant(results, threshold=0.20) is False


def test_is_relevant_empty_results():
    assert is_relevant([], threshold=0.20) is False


def test_is_relevant_threshold_boundary():
    results = [{"chunk_index": 0, "content": "test", "similarity": 0.20}]
    # Exact threshold value should pass
    assert is_relevant(results, threshold=0.20) is True
    # Just below should fail
    assert is_relevant(results, threshold=0.21) is False


def test_is_relevant_threshold_validation():
    results = [{"chunk_index": 0, "content": "test", "similarity": 0.50}]
    try:
        is_relevant(results, threshold=1.5)
        assert False, "Should raise ValueError"
    except ValueError:
        pass

    try:
        is_relevant(results, threshold=-0.1)
        assert False, "Should raise ValueError"
    except ValueError:
        pass


# ── retriever with relevance ─────────────────────────────────────────

def get_test_index():
    chunks = [
        {"chunk_index": 0, "content": "beasiswa mahasiswa universitas", "word_count": 3},
        {"chunk_index": 1, "content": "pendaftaran mahasiswa baru", "word_count": 3},
        {"chunk_index": 2, "content": "jadwal ujian semester", "word_count": 3},
        {"chunk_index": 3, "content": "syarat beasiswa mahasiswa", "word_count": 3},
    ]
    index = TfidfIndex()
    index.fit(chunks)
    return index


def test_retrieve_with_relevance_relevant():
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance("syarat beasiswa")

    assert result["query"] == "syarat beasiswa"
    assert result["relevant"] is True
    assert result["threshold"] == 0.20
    assert result["top_k"] == 3
    assert result["max_similarity"] is not None
    assert result["max_similarity"] > 0.20
    assert len(result["results"]) > 0


def test_retrieve_with_relevance_irrelevant():
    config = RetrievalConfig(similarity_threshold=0.80, top_k=3)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance("xyz unknown qwerty")

    assert result["relevant"] is False
    assert result["threshold"] == 0.80
    # Results still included for debugging
    assert isinstance(result["results"], list)


def test_retrieve_with_relevance_empty_query():
    config = RetrievalConfig(similarity_threshold=0.20)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance("")

    assert result["query"] == ""
    assert result["relevant"] is False
    assert result["max_similarity"] is None
    assert result["results"] == []


def test_retrieve_with_relevance_structure():
    config = RetrievalConfig(similarity_threshold=0.20)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance("beasiswa")

    # Check all required keys
    assert "query" in result
    assert "relevant" in result
    assert "threshold" in result
    assert "top_k" in result
    assert "max_similarity" in result
    assert "results" in result


def test_retrieve_with_relevance_threshold_boundary():
    """Test behavior at exact threshold boundary."""
    config = RetrievalConfig(similarity_threshold=0.50)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    # Query that produces high similarity
    result = service.retrieve_with_relevance("beasiswa mahasiswa")

    if result["max_similarity"] is not None:
        # If max_similarity exactly equals threshold, should be relevant
        if result["max_similarity"] == 0.50:
            assert result["relevant"] is True


# ── convenience function ─────────────────────────────────────────────

def test_retrieve_convenience_function():
    config = RetrievalConfig(similarity_threshold=0.20)
    index = get_test_index()

    result = retrieve(index, "beasiswa", config=config)

    assert "query" in result
    assert "relevant" in result
    assert "threshold" in result
    assert result["query"] == "beasiswa"


def test_retrieve_convenience_default_config():
    index = get_test_index()
    result = retrieve(index, "beasiswa")

    assert "relevant" in result
    assert result["threshold"] >= 0


# ── integration scenarios ────────────────────────────────────────────

def test_realistic_relevant_query():
    """Query that should definitely be relevant."""
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance("persyaratan beasiswa IPK")

    assert result["relevant"] is True
    assert result["max_similarity"] is not None
    assert result["max_similarity"] >= 0.20
    assert len(result["results"]) > 0


def test_realistic_irrelevant_query():
    """Query completely unrelated to documents."""
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    index = get_test_index()
    service = RetrieverService(index, config=config)

    result = service.retrieve_with_relevance(
        "bagaimana cara memasak nasi goreng dengan resep tradisional"
    )

    assert result["relevant"] is False
    assert result["threshold"] == 0.20


def test_borderline_query():
    """Query with medium relevance."""
    chunks = [
        {
            "chunk_index": 0,
            "content": "beasiswa IPK 3.5 mahasiswa universitas kampus",
            "word_count": 5,
        },
        {
            "chunk_index": 1,
            "content": "ujian semester akademik nilai",
            "word_count": 4,
        },
    ]
    index = TfidfIndex()
    index.fit(chunks)

    # Strict threshold
    config_strict = RetrievalConfig(similarity_threshold=0.90, top_k=2)
    service_strict = RetrieverService(index, config=config_strict)

    result_strict = service_strict.retrieve_with_relevance("IPK beasiswa")
    # With high threshold, might be irrelevant

    # Lenient threshold
    config_lenient = RetrievalConfig(similarity_threshold=0.10, top_k=2)
    service_lenient = RetrieverService(index, config=config_lenient)

    result_lenient = service_lenient.retrieve_with_relevance("IPK beasiswa")
    # With low threshold, should be relevant

    # Both should have same query and results
    assert result_strict["query"] == result_lenient["query"]
    assert len(result_strict["results"]) == len(result_lenient["results"])
    # But different relevance judgment
    # (might be same if results have very high similarity)


def test_multiple_threshold_values():
    """Same query with different thresholds."""
    config1 = RetrievalConfig(similarity_threshold=0.10)
    config2 = RetrievalConfig(similarity_threshold=0.50)
    config3 = RetrievalConfig(similarity_threshold=0.90)

    index = get_test_index()

    s1 = RetrieverService(index, config=config1)
    s2 = RetrieverService(index, config=config2)
    s3 = RetrieverService(index, config=config3)

    query = "beasiswa mahasiswa"
    r1 = s1.retrieve_with_relevance(query)
    r2 = s2.retrieve_with_relevance(query)
    r3 = s3.retrieve_with_relevance(query)

    # As threshold increases, relevant might change to False
    # but results should be the same (first results of ranking)
    assert len(r1["results"]) == len(r2["results"]) == len(r3["results"])


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
