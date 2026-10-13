"""TF-IDF indexing service for retrieval pipeline.

Uses scikit-learn TfidfVectorizer to build a TF-IDF matrix from document
chunks. By default the vectorizer uses the analyzer from ``text_analysis``
(identifier splitting, light Indonesian stemming, bigrams, EN+ID stop words).
Passing custom ``stop_words`` / ``ngram_range`` switches to sklearn's plain
word analyzer (kept for backwards compatibility and tests).

Besides the query vector, the index exposes ``term_coverage``: the IDF-weighted
share of query terms present in each chunk. Cosine similarity is length
normalized, so a short query against a long chunk scores low even when every
query term is present; coverage is the length-independent companion signal
used by the relevance gate in ``retrieval.py``.
"""

from __future__ import annotations

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

from definitions import definition_terms
from text_analysis import STOP_WORDS, analyze, stem, tokenize

# Backwards-compatible alias
_STOP_WORDS = set(STOP_WORDS)


class TfidfIndex:
    """TF-IDF index for efficient text retrieval."""

    def __init__(
        self,
        max_features: int | None = None,
        stop_words: set[str] | None = None,
        ngram_range: tuple[int, int] = (1, 1),
        min_df: int = 1,
        max_df: float = 1.0,
        sublinear_tf: bool = True,
    ):
        """Initialize TF-IDF index configuration.

        Args:
            max_features: Cap vocabulary size. None (default) keeps every term;
                capping drops the *rarest* terms, which are the most discriminative.
            stop_words: Custom stop words. Passing this (or a non-default
                ngram_range) switches to sklearn's plain word analyzer.
            ngram_range: n-gram range for the plain analyzer, e.g. (1, 2).
            min_df: Minimum document frequency (count or fraction).
            max_df: Maximum document frequency (fraction of total docs).
            sublinear_tf: Apply 1 + log(tf) scaling.
        """
        self.max_features = max_features
        self.smart = stop_words is None and ngram_range == (1, 1)
        self.stop_words = stop_words if stop_words is not None else _STOP_WORDS
        self.ngram_range = ngram_range
        self.min_df = min_df
        self.max_df = max_df
        self.sublinear_tf = sublinear_tf

        self.vectorizer: TfidfVectorizer | None = None
        self.matrix: sparse.csr_matrix | None = None
        self.chunks: list[dict] | None = None
        self.n_features: int = 0
        self._presence: sparse.csr_matrix | None = None  # binary term presence
        self._definitions: list[set[str]] = []  # terms each chunk defines

    def fit(self, chunks: list[dict]) -> None:
        """Build TF-IDF index from chunks.

        Raises:
            ValueError: If chunks is empty or missing 'content' keys.
        """
        if not chunks:
            raise ValueError("Cannot fit on empty chunks")

        if not all("content" in c for c in chunks):
            raise ValueError("All chunks must have 'content' key")

        contents = [c["content"] for c in chunks]

        if self.smart:
            analyzer_kwargs: dict = {"analyzer": analyze}
        else:
            analyzer_kwargs = {
                "stop_words": list(self.stop_words),
                "ngram_range": self.ngram_range,
                "lowercase": True,
            }
        self.vectorizer = TfidfVectorizer(
            max_features=self.max_features,
            min_df=self.min_df,
            max_df=self.max_df,
            norm="l2",
            sublinear_tf=self.sublinear_tf,
            **analyzer_kwargs,
        )

        # Kept sparse: dense matrices explode on large corpora.
        self.matrix = self.vectorizer.fit_transform(contents).tocsr()
        self._presence = (self.matrix > 0).astype(np.float32).tocsc()
        self._definitions = [definition_terms(c) for c in contents] if self.smart else []
        self.chunks = chunks
        self.n_features = self.matrix.shape[1]

    def transform_query(self, query: str) -> np.ndarray:
        """Transform query string to a dense TF-IDF vector (n_features,)."""
        if self.vectorizer is None:
            raise RuntimeError("Must call fit() before transform_query()")

        if not query or not query.strip():
            return np.zeros(self.n_features)

        return self.vectorizer.transform([query]).toarray()[0]

    def term_coverage(self, query: str) -> np.ndarray | None:
        """IDF-weighted fraction of query terms present in each chunk.

        Each content term of the query (stop words removed) counts with its IDF.
        A term is covered if it, or its stem, occurs in the chunk. Terms that
        occur in no chunk at all (out of vocabulary) count as *uncovered* with
        the maximum IDF, so a query about something absent from the knowledge
        base cannot reach a high coverage by matching only its generic words.

        Returns:
            Array (n_chunks,) in [0, 1], or None when unavailable (plain
            analyzer mode or no content terms).
        """
        if self.vectorizer is None or self._presence is None:
            raise RuntimeError("Must call fit() first")
        if not self.smart:
            return None

        vocab = self.vectorizer.vocabulary_
        idf = dict(zip(self.vectorizer.get_feature_names_out(), self.vectorizer.idf_))
        idf_max = float(max(self.vectorizer.idf_))

        terms = sorted(set(tokenize(query)))
        if not terms:
            return None

        n_chunks = self._presence.shape[0]
        weights: list[float] = []
        covered = np.zeros(n_chunks)
        for t in terms:
            feats = [f for f in {t, stem(t)} if f in vocab]
            if not feats:
                weights.append(idf_max)
                continue
            w = max(idf[f] for f in feats)
            weights.append(w)
            present = np.asarray(
                self._presence[:, [vocab[f] for f in feats]].sum(axis=1)
            ).ravel() > 0
            covered += w * present
        return covered / sum(weights)

    def definition_match(self, query: str) -> np.ndarray | None:
        """IDF-weighted share of query terms that each chunk *defines*
        (see ``definitions.py``). None in plain-analyzer mode."""
        if self.vectorizer is None:
            raise RuntimeError("Must call fit() first")
        if not self.smart:
            return None
        terms = sorted(set(tokenize(query)))
        if not terms:
            return None
        idf = dict(zip(self.vectorizer.get_feature_names_out(), self.vectorizer.idf_))
        idf_max = float(max(self.vectorizer.idf_))
        weights = [max((idf.get(f, 0.0) for f in {t, stem(t)}), default=0.0) or idf_max for t in terms]
        out = np.zeros(len(self._definitions))
        for j, defined in enumerate(self._definitions):
            out[j] = sum(w for t, w in zip(terms, weights) if t in defined or stem(t) in defined)
        return out / sum(weights)

    def get_matrix(self) -> sparse.csr_matrix:
        """Get TF-IDF matrix (n_chunks × n_features), sparse CSR."""
        if self.matrix is None:
            raise RuntimeError("Must call fit() first")
        return self.matrix

    def get_chunks(self) -> list[dict]:
        """Get original chunks in same order as matrix rows."""
        if self.chunks is None:
            raise RuntimeError("Must call fit() first")
        return self.chunks

    def get_vocabulary_size(self) -> int:
        """Get vocabulary size (number of features)."""
        if self.vectorizer is None:
            raise RuntimeError("Must call fit() first")
        return self.n_features

    def get_feature_names(self) -> list[str]:
        """Get vocabulary (feature names)."""
        if self.vectorizer is None:
            raise RuntimeError("Must call fit() first")
        names = self.vectorizer.get_feature_names_out()
        return names.tolist() if hasattr(names, "tolist") else list(names)
