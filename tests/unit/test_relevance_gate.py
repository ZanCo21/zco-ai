"""Relevance gate: cosine path + coverage path, threshold never silently lowered."""

import pytest

from config import RetrievalConfig
from retrieval import RetrieverService
from tfidf_service import TfidfIndex

CHUNKS = [
    {"content": "MCAR adalah data hilang acak. " + " ".join(f"isi{i}" for i in range(60))},
    {"content": "Jadwal ujian semester ganjil. " + " ".join(f"lain{i}" for i in range(60))},
    {"content": "Membuat laporan keuangan bulanan. " + " ".join(f"uang{i}" for i in range(60))},
]


def make(threshold=0.20, **kw):
    idx = TfidfIndex()
    idx.fit(CHUNKS)
    return RetrieverService(idx, RetrievalConfig(similarity_threshold=threshold, top_k=3, **kw))


def test_short_query_passes_through_coverage_path_not_lowered_threshold():
    r = make().retrieve_with_relevance("Apa itu MCAR?")
    assert r["max_similarity"] < 0.20  # cosine alone would reject (the original bug)
    assert r["relevant"] and r["relevance_reason"] == "coverage"
    assert r["threshold"] == 0.20  # threshold reported unchanged, no hidden halving
    assert r["results"][0]["chunk_index"] == 0


def test_strong_match_uses_cosine_path():
    r = make(threshold=0.05).retrieve_with_relevance("MCAR data hilang acak")
    assert r["relevance_reason"] == "cosine"


def test_unknown_terms_are_rejected():
    r = make().retrieve_with_relevance("Bagaimana cara membuat nasi goreng?")
    assert not r["relevant"] and r["relevance_reason"] == "none"


def test_partial_overlap_with_unknown_terms_is_rejected():
    r = make().retrieve_with_relevance("laporan teori relativitas einstein")
    assert not r["relevant"]


def test_empty_and_stopword_only_queries_are_not_relevant():
    s = make()
    assert not s.retrieve_with_relevance("")["relevant"]
    assert not s.retrieve_with_relevance("apa itu")["relevant"]


def test_coverage_threshold_is_configurable():
    strict = make(threshold=0.99, coverage_threshold=1.0).retrieve_with_relevance("laporan keuangan bulanan MCAR")
    assert not strict["relevant"]


def test_min_similarity_floor_applies_to_coverage_path():
    r = make(min_similarity=0.99).retrieve_with_relevance("Apa itu MCAR?")
    assert not r["relevant"]


def test_result_exposes_transparency_fields():
    r = make().retrieve_with_relevance("apa yang dimaksud MCAR")
    for key in ("query", "normalized_query", "relevant", "relevance_reason", "threshold",
                "coverage_threshold", "top_k", "max_similarity", "max_coverage", "results"):
        assert key in r
    assert r["normalized_query"] == "mcar"
    assert {"similarity", "coverage", "chunk_index", "content"} <= set(r["results"][0])


@pytest.mark.parametrize("bad", [-0.1, 1.1])
def test_config_validates_coverage_params(bad):
    with pytest.raises(ValueError):
        RetrievalConfig(coverage_threshold=bad)
    with pytest.raises(ValueError):
        RetrievalConfig(min_similarity=bad)


def test_config_reads_env(monkeypatch):
    monkeypatch.setenv("COVERAGE_THRESHOLD", "0.7")
    monkeypatch.setenv("MIN_SIMILARITY", "0.1")
    c = RetrievalConfig()
    assert (c.coverage_threshold, c.min_similarity) == (0.7, 0.1)
