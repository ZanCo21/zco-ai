"""Definition detection: acronym expansions, copular definitions, query intent."""

import pytest

from definitions import definition_terms, has_definition_intent
from config import RetrievalConfig
from retrieval import RetrieverService
from tfidf_service import TfidfIndex


@pytest.mark.parametrize("q", [
    "Apa itu MCAR?", "apa yang dimaksud negasi", "definisi outlier", "Pengertian KDE",
    "kepanjangan IQR", "what is overfitting",
])
def test_definition_intent_detected(q):
    assert has_definition_intent(q)


@pytest.mark.parametrize("q", ["Berapa ambang batas Z-score?", "bagaimana cara mengatasi outlier", "kapan listwise deletion dipakai"])
def test_non_definition_queries(q):
    assert not has_definition_intent(q)


def test_acronym_then_expansion():
    t = definition_terms("- Tipe: MCAR (Missing Completely at Random) | Definisi: ...")
    assert "mcar" in t and "completely" in t


def test_expansion_then_acronym():
    assert "kde" in definition_terms("Kernel Density Estimation (KDE) dipakai untuk histogram")


def test_non_matching_parenthesis_is_not_a_definition():
    # "(deletion)" is not an acronym of "dibuang"
    assert "deletion" not in definition_terms("jika data dibuang (deletion) vs. diisi (imputation)")
    # initials must spell the acronym
    assert "xyz" not in definition_terms("Missing Completely at Random (XYZ)")


def test_copular_definition():
    t = definition_terms("Negasi adalah operasi logika yang membalikkan nilai kebenaran.")
    assert "negasi" in t


def test_definition_chunk_outranks_chunk_that_only_mentions_term():
    chunks = [
        {"content": "Jika MCAR dan proporsi kecil, hapus baris. Pastikan bukan MCAR sebelum menghapus. Cek MCAR."},
        {"content": "Tipe Missing: MCAR (Missing Completely at Random) | Contoh: sensor mati. " + "isi " * 20},
        {"content": "Jadwal ujian semester ganjil dan genap."},
    ]
    idx = TfidfIndex()
    idx.fit(chunks)
    svc = RetrieverService(idx, RetrievalConfig(0.2, 3))
    # plain lookup: the chunk mentioning MCAR most wins
    assert svc.retrieve("MCAR", 1)[0]["chunk_index"] == 0
    # definition intent: the defining chunk wins
    assert svc.retrieve("Apa itu MCAR?", 1)[0]["chunk_index"] == 1
