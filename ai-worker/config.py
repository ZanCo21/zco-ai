"""Configuration for retrieval pipeline.

Centralized configuration for TF-IDF retrieval and threshold settings.
Loaded from environment variables with sensible defaults.
"""

import os


class RetrievalConfig:
    """Configuration for similarity threshold and top-k retrieval."""

    def __init__(
        self,
        similarity_threshold: float | None = None,
        top_k: int | None = None,
        coverage_threshold: float | None = None,
        min_similarity: float | None = None,
    ):
        """Initialize retrieval configuration.

        Args:
            similarity_threshold: Minimum cosine similarity to consider result relevant.
                Loaded from SIMILARITY_THRESHOLD env var if not provided.
                Default: 0.20
            top_k: Maximum number of chunks to retrieve.
                Loaded from TOP_K env var if not provided.
                Default: 3

            coverage_threshold: Minimum IDF-weighted query-term coverage for the
                second relevance path (see ``retrieval.py``). COVERAGE_THRESHOLD
                env var, default 0.50.
            min_similarity: Cosine floor that the coverage path must still clear
                so that generic words alone cannot pass. MIN_SIMILARITY env var,
                default 0.03.

        Raises:
            ValueError: If threshold not in [0, 1] or top_k <= 0.
        """
        # Load from environment or use defaults
        if similarity_threshold is None:
            similarity_threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.20"))

        if top_k is None:
            top_k = int(os.getenv("TOP_K", "3"))

        if coverage_threshold is None:
            coverage_threshold = float(os.getenv("COVERAGE_THRESHOLD", "0.50"))

        if min_similarity is None:
            min_similarity = float(os.getenv("MIN_SIMILARITY", "0.03"))

        # Validate
        if not (0 <= similarity_threshold <= 1):
            raise ValueError(
                f"similarity_threshold must be in [0, 1], got {similarity_threshold}"
            )

        if top_k <= 0:
            raise ValueError(f"top_k must be > 0, got {top_k}")

        for name, val in (("coverage_threshold", coverage_threshold), ("min_similarity", min_similarity)):
            if not (0 <= val <= 1):
                raise ValueError(f"{name} must be in [0, 1], got {val}")

        self.similarity_threshold = similarity_threshold
        self.top_k = top_k
        self.coverage_threshold = coverage_threshold
        self.min_similarity = min_similarity

    def __repr__(self) -> str:
        return (
            f"RetrievalConfig(threshold={self.similarity_threshold}, "
            f"top_k={self.top_k}, coverage={self.coverage_threshold}, "
            f"min_similarity={self.min_similarity})"
        )


# Global default config (can be overridden by caller)
_default_config = RetrievalConfig()


def get_default_config() -> RetrievalConfig:
    """Get default retrieval configuration."""
    return _default_config


def set_default_config(config: RetrievalConfig) -> None:
    """Set default retrieval configuration (for testing)."""
    global _default_config
    _default_config = config
