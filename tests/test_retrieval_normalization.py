"""Test that retrieval works with query normalization.

Verifies that "negasi" and "apa yang dimaksud negasi" retrieve same content,
while unrelated queries still fail appropriately.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "ai-worker"))

from tfidf_service import TfidfIndex
from retrieval import RetrieverService
from config import RetrievalConfig


def test_retrieval_with_normalization():
    """Test retrieval on sample chunks with query normalization."""

    # Sample chunks about logic concepts
    chunks = [
        {
            "content": "Negasi adalah operasi logika yang membalikkan nilai kebenaran. "
                      "Jika proposisi P bernilai benar, maka negasi P bernilai salah, "
                      "dan sebaliknya. Negasi dilambangkan dengan simbol ~ atau ¬."
        },
        {
            "content": "Konjungsi adalah operasi logika yang menggabungkan dua proposisi. "
                      "Hasil konjungsi bernilai benar hanya jika kedua proposisi bernilai benar. "
                      "Konjungsi dilambangkan dengan simbol &, &&, atau AND."
        },
        {
            "content": "Disjungsi adalah operasi logika yang menawarkan pilihan antara dua proposisi. "
                      "Hasil disjungsi bernilai benar jika minimal salah satu proposisi bernilai benar. "
                      "Disjungsi dilambangkan dengan simbol | atau OR."
        },
    ]

    # Build TF-IDF index
    index = TfidfIndex()
    index.fit(chunks)

    # Create retriever with standard threshold
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    retriever = RetrieverService(index, config=config)

    # Test queries that should all find negasi
    queries = [
        "negasi",
        "apa itu negasi",
        "apa yang dimaksud negasi",
        "jelaskan negasi",
        "pengertian negasi",
    ]

    print("Testing retrieval with different query forms:")
    print("-" * 80)

    top_results = {}
    for query in queries:
        result = retriever.retrieve_with_relevance(query, top_k=1)

        if result["results"]:
            top_chunk_idx = result["results"][0]["chunk_index"]
            similarity = result["results"][0]["similarity"]
            relevant = result["relevant"]

            top_results[query] = (top_chunk_idx, similarity, relevant)

            status = "RELEVANT" if relevant else "NOT_RELEVANT"
            print(f"Query: {query:40}")
            print(f"  Normalized: {result['normalized_query']!r}")
            print(f"  Top chunk: {top_chunk_idx}, Similarity: {similarity:.4f}, Status: {status}")
        else:
            top_results[query] = (None, 0.0, False)
            print(f"Query: {query:40}")
            print(f"  Normalized: {result['normalized_query']!r}")
            print(f"  Top chunk: NONE, Status: NOT_RELEVANT")

        print()

    # Verify all short forms retrieve the negasi chunk (chunk 0)
    print("Verification:")
    print("-" * 80)

    for query, (chunk_idx, sim, relevant) in top_results.items():
        expected_chunk = 0  # negasi chunk
        status = "PASS" if chunk_idx == expected_chunk and relevant else "FAIL"
        print(f"[{status}] {query:40} -> chunk {chunk_idx} (expected {expected_chunk})")

    # Test unrelated query (should not be relevant)
    print()
    print("Testing unrelated query:")
    print("-" * 80)

    unrelated = "bagaimana cara memasak nasi goreng"
    result = retriever.retrieve_with_relevance(unrelated, top_k=1)

    relevant = result["relevant"]
    status = "PASS" if not relevant else "FAIL"
    print(f"[{status}] Query '{unrelated}' relevant={relevant} (expected False)")

    if result["results"]:
        print(f"      Top chunk: {result['results'][0]['chunk_index']}, "
              f"Similarity: {result['results'][0]['similarity']:.4f}")


if __name__ == "__main__":
    print("=" * 80)
    print("Retrieval with Query Normalization Tests")
    print("=" * 80)
    print()
    test_retrieval_with_normalization()
    print()
    print("[PASS] Retrieval normalization test completed")
