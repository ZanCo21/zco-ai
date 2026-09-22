"""TF-IDF indexing service for retrieval pipeline.

Uses scikit-learn TfidfVectorizer to build a TF-IDF matrix
from document chunks. Provides query transformation for
downstream cosine similarity ranking.
"""

from __future__ import annotations

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


# Stop words: minimal set covering English and common Indonesian
_STOP_WORDS = {
    # English
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "or", "that",
    "the", "to", "was", "with", "you",
    # Indonesian
    "dan", "atau", "yang", "untuk", "pada", "di", "ke", "dari", "dengan",
    "adalah", "ada", "telah", "dapat", "akan", "oleh", "ini", "itu", "jika",
    "sebagai", "karena", "sudah", "masih", "hanya", "juga", "bisa", "tidak",
}


class TfidfIndex:
    """TF-IDF index for efficient text retrieval.

    Builds and manages a TF-IDF matrix from document chunks,
    allowing fast query vector transformation for similarity search.
    """

    def __init__(
        self,
        max_features: int | None = 5000,
        stop_words: set[str] | None = None,
        ngram_range: tuple[int, int] = (1, 1),
        min_df: int = 1,
        max_df: float = 1.0,
    ):
        """Initialize TF-IDF index configuration.

        Args:
            max_features: Cap vocabulary size. None for no limit.
            stop_words: Set of stop words to exclude. Defaults to English+Indonesian.
            ngram_range: Tokenizer n-gram range, e.g. (1, 2) for unigrams + bigrams.
            min_df: Minimum document frequency (count or fraction).
            max_df: Maximum document frequency (fraction of total docs).
        """
        self.max_features = max_features
        self.stop_words = stop_words if stop_words is not None else _STOP_WORDS
        self.ngram_range = ngram_range
        self.min_df = min_df
        self.max_df = max_df

        self.vectorizer: TfidfVectorizer | None = None
        self.matrix: np.ndarray | None = None
        self.chunks: list[dict] | None = None
        self.n_features: int = 0  # Will be set after fit

    def fit(self, chunks: list[dict]) -> None:
        """Build TF-IDF index from chunks.

        Args:
            chunks: List of chunk dicts with 'content' key.

        Raises:
            ValueError: If chunks is empty or missing 'content' keys.
        """
        if not chunks:
            raise ValueError("Cannot fit on empty chunks")

        if not all("content" in c for c in chunks):
            raise ValueError("All chunks must have 'content' key")

        # Extract content strings for vectorization
        contents = [c["content"] for c in chunks]

        # Build vectorizer
        self.vectorizer = TfidfVectorizer(
            max_features=self.max_features,
            stop_words=list(self.stop_words),
            ngram_range=self.ngram_range,
            min_df=self.min_df,
            max_df=self.max_df,
            lowercase=True,
            norm="l2",  # L2 norm for cosine similarity compatibility
        )

        # Fit and transform
        self.matrix = self.vectorizer.fit_transform(contents).toarray()
        self.chunks = chunks
        self.n_features = self.matrix.shape[1]

    def transform_query(self, query: str) -> np.ndarray:
        """Transform query string to TF-IDF vector.

        Args:
            query: Query text.

        Returns:
            TF-IDF vector (1D array, shape = (n_features,)).

        Raises:
            RuntimeError: If index not fitted yet.
        """
        if self.vectorizer is None:
            raise RuntimeError("Must call fit() before transform_query()")

        if not query or not query.strip():
            # Return zero vector for empty query
            return np.zeros(self.n_features)

        # Transform query
        query_vec = self.vectorizer.transform([query]).toarray()
        return query_vec[0]  # Return 1D array

    def get_matrix(self) -> np.ndarray:
        """Get TF-IDF matrix (n_chunks × n_features)."""
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
        return names.tolist() if hasattr(names, 'tolist') else list(names)
