"""TF-IDF analyzer: tokenization, stemming, stop words, coverage."""

from text_analysis import STOP_WORDS, analyze, stem, tokenize
from tfidf_service import TfidfIndex


def test_hyphenated_compound_keeps_parts_and_joined_form():
    toks = tokenize("Z-score")
    assert {"z", "score", "zscore"} <= set(toks)
    # query written without hyphen still shares tokens with the document
    assert "score" in tokenize("z score")


def test_identifiers_are_split_and_kept_whole():
    toks = tokenize("train_test_split SeriousDlqin2yrs")
    assert "train_test_split" in toks and "split" in toks
    assert "seriousdlqin2yrs" in toks and "serious" in toks


def test_question_words_are_stop_words():
    assert tokenize("apa itu bagaimana jelaskan") == []
    assert {"apa", "bagaimana", "jelaskan", "yang", "dan"} <= STOP_WORDS


def test_stem_is_conservative():
    assert stem("menganalisis") == "analisis"
    assert stem("outliers") == "outlier"
    # short / non-alphabetic / English words are untouched
    assert stem("serious") == "serious"
    assert stem("sklearn") == "sklearn"
    assert stem("x_train") == "x_train"
    assert stem("pen") == "pen"


def test_analyze_adds_stem_next_to_original():
    feats = analyze("menganalisis", bigrams=False)
    assert feats == ["menganalisis", "analisis"]


def test_morphological_variants_match():
    idx = TfidfIndex()
    idx.fit([{"content": "Mahasiswa mampu menganalisis keberadaan outliers"}, {"content": "resep nasi goreng enak"}])
    q = idx.transform_query("analisis outlier")
    sims = (idx.get_matrix() @ q)
    assert sims[0] > 0 and sims[1] == 0


def test_coverage_counts_unknown_terms_as_uncovered():
    idx = TfidfIndex()
    idx.fit([{"content": "membuat laporan data bulanan"}, {"content": "jadwal ujian semester"}])
    in_kb = idx.term_coverage("laporan data")
    off_topic = idx.term_coverage("membuat nasi goreng")  # 'nasi', 'goreng' absent everywhere
    assert in_kb.max() == 1.0
    assert off_topic.max() < 0.5


def test_coverage_is_none_for_plain_analyzer():
    idx = TfidfIndex(stop_words={"x"})
    idx.fit([{"content": "satu dua"}])
    assert idx.term_coverage("satu") is None
