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
    ):
        """Initialize retrieval configuration.

        Args:
            similarity_threshold: Minimum cosine similarity to consider result relevant.
                Loaded from SIMILARITY_THRESHOLD env var if not provided.
                Default: 0.20
            top_k: Maximum number of chunks to retrieve.
                Loaded from TOP_K env var if not provided.
                Default: 3

        Raises:
            ValueError: If threshold not in [0, 1] or top_k <= 0.
        """
        # Load from environment or use defaults
        if similarity_threshold is None:
            similarity_threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.20"))

        if top_k is None:
            top_k = int(os.getenv("TOP_K", "3"))

        # Validate
        if not (0 <= similarity_threshold <= 1):
            raise ValueError(
                f"similarity_threshold must be in [0, 1], got {similarity_threshold}"
            )

        if top_k <= 0:
            raise ValueError(f"top_k must be > 0, got {top_k}")

        self.similarity_threshold = similarity_threshold
        self.top_k = top_k

    def __repr__(self) -> str:
        return (
            f"RetrievalConfig(threshold={self.similarity_threshold}, "
            f"top_k={self.top_k})"
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
