"""Cosine similarity-based retrieval service.

Uses the TF-IDF index to rank chunks by cosine similarity to user queries,
with a configurable relevance gate that decides whether the LLM may be asked
at all.

Relevance gate (checked before generation)
-------------------------------------------
A query is *relevant* when the top-k results contain a chunk that satisfies
either path:

1. **cosine**   : ``cosine >= SIMILARITY_THRESHOLD`` (default 0.20, unchanged)
2. **coverage** : ``coverage >= COVERAGE_THRESHOLD`` and
                  ``cosine >= MIN_SIMILARITY``

Why a second path: cosine is length-normalized, so a short question such as
"Apa itu MCAR?" against a 150-word chunk that does define MCAR scores ~0.09
even though *every* query term is present. Instead of lowering the cosine
threshold (which would also admit unrelated queries), the second path asks a
different question: "what IDF-weighted share of the query's terms occur in this
chunk?". Out-of-vocabulary terms count as uncovered, so off-topic queries
("cara membuat nasi goreng") that only match generic words stay below it.
Both signals are returned for transparency.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from definitions import has_definition_intent
from config import RetrievalConfig, get_default_config
from query_normalizer import normalize_query
from tfidf_service import TfidfIndex

# Rank = cosine * (1 - w + w * coverage). Coverage breaks ties between chunks
# with similar cosine in favour of the one that actually contains the query's
# terms (e.g. the definition row rather than a summary mentioning one term).
COVERAGE_RANK_WEIGHT = 0.5

# For "apa itu X" queries: rank *= 1 + DEFINITION_BOOST * (share of query terms
# the chunk defines). A chunk that defines the term (``MCAR (Missing Completely
# at Random)``, "X adalah ...") then beats chunks that merely mention it often.
DEFINITION_BOOST = 4.0


class RetrieverService:
    """Retrieve relevant chunks via TF-IDF + cosine similarity."""

    def __init__(
        self,
        tfidf_index: TfidfIndex,
        config: RetrievalConfig | None = None,
    ):
        if tfidf_index.matrix is None:
            raise ValueError("TfidfIndex must be fitted before creating RetrieverService")
        self.index = tfidf_index
        self.config = config or get_default_config()

    def _score(self, query: str) -> tuple[np.ndarray, np.ndarray | None]:
        """Return (cosine, coverage|None) per chunk for an already-normalized query."""
        query_vec = self.index.transform_query(query)
        if np.allclose(query_vec, 0):
            return np.zeros(self.index.matrix.shape[0]), None
        cos = cosine_similarity(query_vec.reshape(1, -1), self.index.get_matrix())[0]
        return cos, self.index.term_coverage(query)

    def retrieve(self, query: str, top_k: int | None = None) -> list[dict]:
        """Retrieve top-k chunks (raw results, ranked).

        Returns:
            List of dicts sorted by rank: chunk_index, content, similarity
            (cosine), coverage (or None), word_count.

        Raises:
            ValueError: If top_k <= 0.
        """
        if top_k is None:
            top_k = self.config.top_k
        if top_k <= 0:
            raise ValueError("top_k must be > 0")
        if not query or not query.strip():
            return []

        # Strip question scaffolding ("apa yang dimaksud ...") but never
        # normalize a query into nothing.
        normalized = normalize_query(query) or query

        cos, cov = self._score(normalized)
        if not np.any(cos > 0):
            return []

        if cov is not None:
            rank = cos * (1 - COVERAGE_RANK_WEIGHT + COVERAGE_RANK_WEIGHT * cov)
        else:
            rank = cos
        if has_definition_intent(query):
            defined = self.index.definition_match(normalized)
            if defined is not None:
                rank = rank * (1 + DEFINITION_BOOST * defined)
        order = np.argsort(-rank, kind="stable")[:top_k]

        chunks = self.index.get_chunks()
        return [
            {
                "chunk_index": int(i),
                "content": chunks[i]["content"],
                "similarity": float(cos[i]),
                "coverage": float(cov[i]) if cov is not None else None,
                "word_count": chunks[i].get("word_count", 0),
            }
            for i in order
            if cos[i] > 0
        ]

    def retrieve_with_relevance(self, query: str, top_k: int | None = None) -> dict:
        """Retrieve chunks and decide whether they are relevant enough for the LLM.

        Returns:
            {
                "query": str, "normalized_query": str,
                "relevant": bool, "relevance_reason": "cosine" | "coverage" | "none",
                "threshold": float, "coverage_threshold": float, "top_k": int,
                "max_similarity": float | None, "max_coverage": float | None,
                "results": list[dict],
            }
        Results are always included (for debugging / the retrieval inspector).
        """
        if top_k is None:
            top_k = self.config.top_k

        results = self.retrieve(query, top_k=top_k)
        cfg = self.config

        reason = "none"
        if any(r["similarity"] >= cfg.similarity_threshold for r in results):
            reason = "cosine"
        elif any(
            r["coverage"] is not None
            and r["coverage"] >= cfg.coverage_threshold
            and r["similarity"] >= cfg.min_similarity
            for r in results
        ):
            reason = "coverage"

        coverages = [r["coverage"] for r in results if r["coverage"] is not None]
        return {
            "query": query,
            "normalized_query": normalize_query(query),
            "relevant": reason != "none",
            "relevance_reason": reason,
            "threshold": cfg.similarity_threshold,
            "coverage_threshold": cfg.coverage_threshold,
            "top_k": top_k,
            "max_similarity": max((r["similarity"] for r in results), default=None),
            "max_coverage": max(coverages) if coverages else None,
            "results": results,
        }


def is_relevant(results: list[dict], threshold: float) -> bool:
    """Check if retrieval results pass the cosine threshold.

    Raises:
        ValueError: If threshold not in [0, 1].
    """
    if not (0 <= threshold <= 1):
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")
    if not results:
        return False
    return max(r["similarity"] for r in results) >= threshold


def retrieve(
    tfidf_index: TfidfIndex,
    query: str,
    config: RetrievalConfig | None = None,
) -> dict:
    """Convenience function for one-off retrieval with relevance."""
    return RetrieverService(tfidf_index, config=config).retrieve_with_relevance(query)
