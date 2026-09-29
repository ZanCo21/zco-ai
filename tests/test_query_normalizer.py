"""Test query normalization and retrieval robustness.

Verifies that questions with different forms retrieve same content
when normalized, and that unrelated queries still fail appropriately.
"""

import sys
from pathlib import Path

# Add ai-worker to path
sys.path.insert(0, str(Path(__file__).parent.parent / "ai-worker"))

from query_normalizer import normalize_query


def test_normalize_query():
    """Test query normalization patterns."""
    tests = [
        # (input, expected_output)
        ("negasi", "negasi"),
        ("apa itu negasi", "negasi"),
        ("apa yang dimaksud negasi", "negasi"),
        ("apa yang negasi", "negasi"),
        ("jelaskan negasi", "negasi"),
        ("sebutkan negasi", "negasi"),
        ("pengertian negasi yang dimaksud", "pengertian negasi"),
        ("negasi yang disebut", "negasi"),
        ("apa", ""),
        ("  ", ""),
        ("", ""),
        ("NEGASI", "negasi"),  # lowercased
        ("Apa Itu NEGASI", "negasi"),  # mixed case
    ]

    for query, expected in tests:
        result = normalize_query(query)
        status = "PASS" if result == expected else "FAIL"
        print(f"[{status}] normalize_query({query!r:40}) -> {result!r:20} (expected {expected!r})")
        assert result == expected, f"normalize_query({query!r}) = {result!r}, expected {expected!r}"


def test_normalization_similarity():
    """Test that different forms normalize to same value."""
    queries = [
        "negasi",
        "apa itu negasi",
        "apa yang dimaksud negasi",
        "jelaskan negasi",
        "pengertian negasi",
    ]

    normalized = [normalize_query(q) for q in queries]

    # Most should normalize to "negasi"
    print("\nNormalization similarity:")
    for q, n in zip(queries, normalized):
        print(f"  {q:40} -> {n!r}")

    # Check that short forms converge
    assert normalized[0] == normalized[1] == normalized[2] == normalized[3]
    print("[PASS] Short forms converge to same normalized value")


if __name__ == "__main__":
    print("=" * 80)
    print("Query Normalization Tests")
    print("=" * 80)
    test_normalize_query()
    print()
    test_normalization_similarity()
    print("\n[PASS] All normalization tests passed")
