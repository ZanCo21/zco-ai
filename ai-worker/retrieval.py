"""Cosine similarity-based retrieval service.

Uses TF-IDF index to rank chunks by semantic similarity
to user queries via cosine similarity scoring.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from tfidf_service import TfidfIndex


class RetrieverService:
    """Retrieve relevant chunks via TF-IDF + cosine similarity."""

    def __init__(self, tfidf_index: TfidfIndex):
        """Initialize retriever with a fitted TF-IDF index.

        Args:
            tfidf_index: Fitted TfidfIndex instance.

        Raises:
            ValueError: If index is not fitted.
        """
        if tfidf_index.matrix is None:
            raise ValueError("TfidfIndex must be fitted before creating RetrieverService")
        self.index = tfidf_index

    def retrieve(self, query: str, top_k: int = 3) -> list[dict]:
        """Retrieve top-k relevant chunks for a query.

        Args:
            query: Query text.
            top_k: Number of top results to return. Must be > 0.

        Returns:
            List of result dicts, sorted by similarity descending.
            Each dict contains: chunk_index, content, similarity, word_count.

        Raises:
            ValueError: If top_k <= 0.
        """
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


def retrieve(
    tfidf_index: TfidfIndex,
    query: str,
    top_k: int = 3,
) -> list[dict]:
    """Convenience function for one-off retrieval.

    Args:
        tfidf_index: Fitted TfidfIndex instance.
        query: Query text.
        top_k: Number of top results.

    Returns:
        List of result dicts, sorted by similarity descending.
    """
    service = RetrieverService(tfidf_index)
    return service.retrieve(query, top_k=top_k)
