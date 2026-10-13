"""PDF -> extraction -> chunking -> TF-IDF/cosine retrieval on the real EDA.pdf.

Proves that facts in the document can be extracted AND found by questions
phrased differently from the source, while unrelated questions are rejected by
the (unchanged, 0.20) similarity threshold + coverage gate.
"""

import pytest


def _hit(result, needles):
    return any(any(n.lower() in r["content"].lower() for n in needles) for r in result["results"])


def test_every_ground_truth_fact_is_extracted(eda_markdown, eda_questions):
    """Extraction must not lose or damage any fact the questions depend on."""
    for item in eda_questions["answerable"]:
        assert any(m.lower() in eda_markdown.lower() for m in item["must"]), item["q"]


def test_answerable_questions_are_retrieved_in_top3(eda_retriever, eda_questions):
    misses = []
    for item in eda_questions["answerable"]:
        r = eda_retriever.retrieve_with_relevance(item["q"], top_k=3)
        if not _hit(r, item["must"]):
            misses.append(item["q"])
    assert not misses, f"not in top-3: {misses}"


def test_hit_rate_at_1_is_high(eda_retriever, eda_questions):
    hits = 0
    for item in eda_questions["answerable"]:
        r = eda_retriever.retrieve_with_relevance(item["q"], top_k=1)
        hits += _hit(r, item["must"])
    # measured 13/17 after the fix (was 11/17 before, on corrupted text)
    assert hits >= 12, f"hit@1 = {hits}/{len(eda_questions['answerable'])}"


def test_answerable_questions_pass_the_relevance_gate(eda_retriever, eda_questions):
    rejected = [
        i["q"] for i in eda_questions["answerable"]
        if not eda_retriever.retrieve_with_relevance(i["q"])["relevant"]
    ]
    assert not rejected, f"wrongly rejected: {rejected}"


def test_threshold_was_not_lowered(eda_retriever):
    assert eda_retriever.config.similarity_threshold == 0.20
    assert eda_retriever.retrieve_with_relevance("Apa itu MCAR?")["threshold"] == 0.20


@pytest.mark.parametrize("q", [
    "Siapa presiden pertama Indonesia?",
    "Bagaimana cara membuat nasi goreng?",
    "Berapa harga bitcoin hari ini?",
    "Jelaskan teori relativitas Einstein",
    "Apa ibu kota Prancis?",
    # same domain, but not covered by the document
    "Bagaimana cara melatih convolutional neural network untuk klasifikasi gambar?",
    "Berapa gaji data scientist di Jakarta?",
    "Apa itu algoritma genetika?",
    "Jelaskan arsitektur transformer dan self-attention",
    "Bagaimana cara deploy model machine learning ke AWS Lambda?",
    "Apa itu hyperparameter tuning dengan grid search?",
])
def test_unanswerable_questions_are_rejected(eda_retriever, q):
    r = eda_retriever.retrieve_with_relevance(q)
    assert not r["relevant"], (q, r["max_similarity"], r["max_coverage"])


@pytest.mark.parametrize("variants", [
    ["Apa itu masking effect?", "jelaskan masking effect", "masking effect pada Z-score itu apa", "apa yang dimaksud masking effect"],
    ["batas Z-score outlier", "ambang Z score untuk outlier", "berapa threshold Z-score untuk mendeteksi pencilan"],
    ["kapan listwise deletion boleh dipakai", "Kapan penghapusan baris (listwise deletion) dibenarkan?"],
])
def test_rephrased_questions_reach_the_same_chunk(eda_retriever, variants):
    top = {eda_retriever.retrieve_with_relevance(q, top_k=3)["results"][0]["chunk_index"] for q in variants}
    pool = set()
    for q in variants:
        pool |= {r["chunk_index"] for r in eda_retriever.retrieve_with_relevance(q, top_k=3)["results"]}
    # all phrasings agree on at least one chunk within their top-3
    common = set.intersection(*[
        {r["chunk_index"] for r in eda_retriever.retrieve_with_relevance(q, top_k=3)["results"]} for q in variants
    ])
    assert common, (variants, top, pool)


def test_morphological_variation_still_finds_the_chunk(eda_retriever):
    # document says "Deteksi Outliers" / "mendeteksi"; query uses "mendeteksi" + "pencilan"
    r = eda_retriever.retrieve_with_relevance("bagaimana mendeteksi pencilan ekstrem?", top_k=3)
    assert r["relevant"]
    assert _hit(r, ["pencilan ekstrem", "Outliers"])


def test_retrieval_is_deterministic(eda_retriever):
    a = eda_retriever.retrieve_with_relevance("Apa itu MCAR?")
    b = eda_retriever.retrieve_with_relevance("Apa itu MCAR?")
    assert a == b
