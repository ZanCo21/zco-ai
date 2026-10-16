"""Language detection, page count and suggested questions (worker /suggest)."""

from config import RetrievalConfig
from document_extraction import page_count
from language import count_words, detect_language
from suggestions import _clean_heading, build_candidates, suggest_questions

import random

ID_TEXT = (
    "Missing value adalah data yang tidak tersedia pada suatu variabel. "
    "Dalam analisis data, nilai yang hilang dapat mengganggu hasil model "
    "karena sebagian besar algoritma tidak dapat bekerja dengan data kosong."
)
EN_TEXT = (
    "Photosynthesis is the process by which plants convert light into chemical "
    "energy. It takes place in the chloroplasts and produces oxygen as a by-product "
    "of the reactions that are driven by sunlight."
)


def _chunks():
    return [
        {
            "doc": "eda",
            "title": "EDA",
            "word_count": 40,
            "content": "# Missing Value\n\nMCAR (Missing Completely at Random) adalah kondisi ketika "
            "data hilang secara acak tanpa pola. Imputasi mean dapat dipakai untuk MCAR.",
        },
        {
            "doc": "eda",
            "title": "EDA",
            "word_count": 35,
            "content": "# Outlier\n\nOutlier adalah nilai ekstrem yang jauh dari sebagian besar data. "
            "Metode IQR dan z-score digunakan untuk mendeteksi outlier.",
        },
        {
            "doc": "bio",
            "title": "Biology",
            "word_count": 38,
            "content": "# Photosynthesis\n\nPhotosynthesis is the process by which plants convert "
            "light into chemical energy inside the chloroplasts of the leaf.",
        },
    ]


CFG = RetrievalConfig(similarity_threshold=0.2, top_k=3, coverage_threshold=0.5, min_similarity=0.03)


def test_detect_language():
    assert detect_language(ID_TEXT) == "id"
    assert detect_language(EN_TEXT) == "en"
    assert detect_language("") is None
    assert detect_language("Tabel 1 2 3") is None


def test_count_words():
    assert count_words("satu dua  tiga\nempat") == 4
    assert count_words("") == 0


def test_page_count(eda_pdf, tmp_path):
    assert page_count(str(eda_pdf)) == 33
    txt = tmp_path / "a.txt"
    txt.write_text("hello")
    assert page_count(str(txt)) is None


def test_clean_heading():
    assert _clean_heading("2.1 Uji Normalitas") == "Uji Normalitas"
    assert _clean_heading("BAB II: Landasan Teori") == "Landasan Teori"
    assert _clean_heading("Daftar Pustaka") is None
    assert _clean_heading("1.") is None
    assert _clean_heading("MISSING VALUE HANDLING") == "Missing Value Handling"


def test_candidates_use_definitions_headings_and_language():
    cands = build_candidates(_chunks(), random.Random(1))
    assert "Apa itu MCAR?" in cands["eda"]
    assert "Apa itu Outlier?" in cands["eda"]
    assert "Jelaskan tentang Missing Value" in cands["eda"]
    # English document -> English templates
    assert any(q.startswith("What is") or q.startswith("Explain") for q in cands["bio"])


def test_suggestions_pass_relevance_gate_and_point_to_their_document():
    from retrieval import RetrieverService
    from tfidf_service import TfidfIndex

    chunks = _chunks()
    picked = suggest_questions(chunks, limit=3, seed=7, config=CFG)
    assert 1 <= len(picked) <= 3
    assert len({p["question"] for p in picked}) == len(picked)

    index = TfidfIndex()
    index.fit([{"chunk_index": i, **c} for i, c in enumerate(chunks)])
    service = RetrieverService(index, config=CFG)
    for p in picked:
        res = service.retrieve_with_relevance(p["question"])
        assert res["relevant"], p
        assert chunks[res["results"][0]["chunk_index"]]["doc"] == p["doc"]


def test_suggestions_spread_across_documents():
    picked = suggest_questions(_chunks(), limit=2, seed=3, config=CFG)
    assert {p["doc"] for p in picked} == {"eda", "bio"}


def test_suggestions_vary_with_seed():
    seen = {
        tuple(p["question"] for p in suggest_questions(_chunks(), limit=2, seed=s, config=CFG))
        for s in range(8)
    }
    assert len(seen) > 1


def test_suggestions_empty_input():
    assert suggest_questions([], limit=3, seed=1, config=CFG) == []


def test_suggestions_on_real_document(eda_markdown):
    from chunking import process_document

    chunks = [
        {**c, "doc": "eda", "title": "EDA"} for c in process_document(eda_markdown)
    ]
    picked = suggest_questions(chunks, limit=3, seed=11, config=CFG)
    assert len(picked) == 3


def test_non_terms_are_not_suggested():
    chunks = [
        {"doc": "d", "title": "D", "word_count": 20,
         "content": "Berikut adalah langkah analisis.\nRegresi adalah metode statistik untuk memodelkan hubungan."},
    ]
    cands = build_candidates(chunks, random.Random(0))["d"]
    assert "Apa itu Berikut?" not in cands
    assert "Apa itu Regresi?" in cands


def test_duplicate_document_does_not_starve_other_documents():
    # The copy's candidates always rank its twin first and are rejected;
    # the other documents must still yield suggestions.
    base = _chunks()
    dup = [{**c, "doc": "eda-copy", "title": "EDA copy"} for c in base if c["doc"] == "eda"]
    for seed in range(5):
        picked = suggest_questions(dup + base, limit=3, seed=seed, config=CFG)
        assert len(picked) >= 2, (seed, picked)
