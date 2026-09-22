"""Cosine similarity-based retrieval service.

Uses TF-IDF index to rank chunks by semantic similarity
to user queries via cosine similarity scoring, with configurable
relevance threshold to prevent low-confidence results reaching LLM.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from config import RetrievalConfig, get_default_config
from tfidf_service import TfidfIndex


class RetrieverService:
    """Retrieve relevant chunks via TF-IDF + cosine similarity."""

    def __init__(
        self,
        tfidf_index: TfidfIndex,
        config: RetrievalConfig | None = None,
    ):
        """Initialize retriever with a fitted TF-IDF index.

        Args:
            tfidf_index: Fitted TfidfIndex instance.
            config: Retrieval configuration (threshold, top_k).
                Uses default if not provided.

        Raises:
            ValueError: If index is not fitted.
        """
        if tfidf_index.matrix is None:
            raise ValueError("TfidfIndex must be fitted before creating RetrieverService")
        self.index = tfidf_index
        self.config = config or get_default_config()

    def retrieve(self, query: str, top_k: int | None = None) -> list[dict]:
        """Retrieve top-k relevant chunks for a query (raw results).

        Args:
            query: Query text.
            top_k: Number of top results to return. Uses config if not provided.

        Returns:
            List of result dicts, sorted by similarity descending.
            Each dict contains: chunk_index, content, similarity, word_count.

        Raises:
            ValueError: If top_k <= 0.
        """
        if top_k is None:
            top_k = self.config.top_k

        if top_k <= 0:
            raise ValueError("top_k must be > 0")

        # Handle empty/whitespace query
        if not query or not query.strip():
            return []

        # Transform query to TF-IDF vector
        query_vec = self.index.transform_query(query)

        # If query vector is all zeros (no vocab overlap), return empty
        if np.allclose(query_vec, 0):
            return []

        # Get matrix (n_chunks × n_features)
        matrix = self.index.get_matrix()

        # Compute cosine similarity: query_vec vs each chunk
        # Reshape query_vec to (1, n_features) for broadcasting
        similarities = cosine_similarity(
            query_vec.reshape(1, -1),
            matrix
        )[0]  # Extract 1D array

        # Prepare results with scores
        results = []
        for chunk_idx, (chunk, sim) in enumerate(zip(self.index.get_chunks(), similarities)):
            results.append({
                "chunk_index": chunk.get("chunk_index", chunk_idx),
                "content": chunk["content"],
                "similarity": float(sim),
                "word_count": chunk.get("word_count", 0),
            })

        # Sort by similarity descending
        results.sort(key=lambda x: x["similarity"], reverse=True)

        # Return top_k
        return results[:top_k]

    def retrieve_with_relevance(
        self,
        query: str,
        top_k: int | None = None,
    ) -> dict:
        """Retrieve chunks with relevance assessment.

        Combines retrieval + threshold checking to determine if results
        are sufficiently relevant for downstream processing (e.g., LLM).

        Args:
            query: Query text.
            top_k: Number of results to retrieve. Uses config if not provided.

        Returns:
            Dict with structure:
            {
                "query": str,
                "relevant": bool,
                "threshold": float,
                "top_k": int,
                "max_similarity": float or None,
                "results": list[dict],
            }

            "relevant" is True iff max(similarity) >= threshold.
            Results are always included (for debugging).
        """
        if top_k is None:
            top_k = self.config.top_k

        # Get raw results
        results = self.retrieve(query, top_k=top_k)

        # Determine relevance
        max_sim = results[0]["similarity"] if results else 0.0
        relevant = max_sim >= self.config.similarity_threshold

        return {
            "query": query,
            "relevant": relevant,
            "threshold": self.config.similarity_threshold,
            "top_k": top_k,
            "max_similarity": max_sim if results else None,
            "results": results,
        }


def is_relevant(
    results: list[dict],
    threshold: float,
) -> bool:
    """Check if retrieval results pass relevance threshold.

    Args:
        results: List of retrieval result dicts (with "similarity" key).
        threshold: Similarity threshold [0, 1].

    Returns:
        True iff highest similarity >= threshold.
        False if results empty or threshold violated.

    Raises:
        ValueError: If threshold not in [0, 1].
    """
    if not (0 <= threshold <= 1):
        raise ValueError(f"threshold must be in [0, 1], got {threshold}")

    if not results:
        return False

    max_sim = results[0]["similarity"]
    return max_sim >= threshold


def retrieve(
    tfidf_index: TfidfIndex,
    query: str,
    config: RetrievalConfig | None = None,
) -> dict:
    """Convenience function for one-off retrieval with relevance.

    Args:
        tfidf_index: Fitted TfidfIndex instance.
        query: Query text.
        config: Retrieval configuration. Uses default if not provided.

    Returns:
        Result dict with query, relevant, threshold, top_k, results.
    """
    service = RetrieverService(tfidf_index, config=config)
    return service.retrieve_with_relevance(query)
