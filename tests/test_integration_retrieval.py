"""End-to-end integration test for query normalization fix.

Tests that retrieval works correctly for:
- Short queries: "negasi"
- Question forms: "apa yang dimaksud negasi"
- Different question patterns: "jelaskan negasi", "pengertian negasi"
- Unrelated queries: properly rejected
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "ai-worker"))

from tfidf_service import TfidfIndex
from retrieval import RetrieverService
from config import RetrievalConfig


# Sample knowledge base (realistic Indonesian academic content)
SAMPLE_CHUNKS = [
    {
        "content": "Negasi adalah operasi logika yang membalikkan nilai kebenaran suatu proposisi. "
                  "Jika proposisi P bernilai benar, maka negasi P (ditulis ~P atau ¬P) bernilai salah, "
                  "dan sebaliknya. Negasi sering disebut juga sebagai operasi NOT dalam logika digital. "
                  "Simbol yang umum digunakan untuk negasi adalah ~ (tilda), ¬ (not sign), atau ! (tanda seru)."
    },
    {
        "content": "Konjungsi adalah operasi logika yang menggabungkan dua proposisi dengan operator AND. "
                  "Hasil konjungsi dari proposisi P dan Q (ditulis P AND Q atau P ∧ Q) bernilai benar "
                  "hanya jika kedua proposisi bernilai benar. Dalam semua kasus lain, hasilnya bernilai salah. "
                  "Tabel kebenaran konjungsi menunjukkan kombinasi empat kemungkinan nilai."
    },
    {
        "content": "Disjungsi adalah operasi logika yang menawarkan pilihan antara dua proposisi dengan operator OR. "
                  "Hasil disjungsi dari proposisi P dan Q (ditulis P OR Q atau P ∨ Q) bernilai benar "
                  "jika minimal salah satu proposisi bernilai benar. Hasil hanya bernilai salah jika kedua proposisi salah. "
                  "Disjungsi dalam logika berbeda dengan penggunaan 'atau' dalam bahasa sehari-hari."
    },
    {
        "content": "Implikasi adalah operasi logika yang menyatakan hubungan sebab-akibat antara dua proposisi. "
                  "Implikasi dari P ke Q (ditulis P → Q atau P ⇒ Q) bernilai salah hanya jika P benar dan Q salah. "
                  "Dalam semua kasus lain, implikasi bernilai benar. P disebut anteseden dan Q disebut konsekuen."
    },
]


def test_short_queries():
    """Test short, direct queries retrieve correct content."""
    print("\n" + "=" * 80)
    print("TEST 1: Short Queries (baseline)")
    print("=" * 80)

    index = TfidfIndex()
    index.fit(SAMPLE_CHUNKS)
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    retriever = RetrieverService(index, config=config)

    test_cases = [
        ("negasi", 0, "Negasi chunk"),
        ("konjungsi", 1, "Konjungsi chunk"),
        ("disjungsi", 2, "Disjungsi chunk"),
        ("implikasi", 3, "Implikasi chunk"),
    ]

    passed = 0
    for query, expected_idx, label in test_cases:
        result = retriever.retrieve_with_relevance(query, top_k=1)

        if result["results"]:
            retrieved_idx = result["results"][0]["chunk_index"]
            sim = result["results"][0]["similarity"]
            is_correct = retrieved_idx == expected_idx and result["relevant"]
        else:
            retrieved_idx = None
            sim = 0.0
            is_correct = False

        status = "PASS" if is_correct else "FAIL"
        passed += 1 if is_correct else 0
        print(f"[{status}] Query: {query:20} -> Chunk {retrieved_idx} "
              f"(expected {expected_idx}), Similarity: {sim:.4f}")

    print(f"\nShort queries: {passed}/{len(test_cases)} passed")
    return passed == len(test_cases)


def test_question_forms():
    """Test different question forms retrieve the same content."""
    print("\n" + "=" * 80)
    print("TEST 2: Question Forms (main fix)")
    print("=" * 80)

    index = TfidfIndex()
    index.fit(SAMPLE_CHUNKS)
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    retriever = RetrieverService(index, config=config)

    # All these should retrieve the negasi chunk (index 0)
    test_cases = [
        "negasi",
        "apa itu negasi",
        "apa yang dimaksud negasi",
        "apa yang negasi",
        "jelaskan negasi",
        "sebutkan negasi",
        "pengertian negasi",
        "definisi negasi",
        "apa negasi",
        "bagaimana negasi",
    ]

    expected_chunk = 0
    passed = 0

    for query in test_cases:
        result = retriever.retrieve_with_relevance(query, top_k=1)

        if result["results"]:
            retrieved_idx = result["results"][0]["chunk_index"]
            sim = result["results"][0]["similarity"]
            is_correct = retrieved_idx == expected_chunk and result["relevant"]
        else:
            retrieved_idx = None
            sim = 0.0
            is_correct = False

        status = "PASS" if is_correct else "FAIL"
        passed += 1 if is_correct else 0
        normalized = result["normalized_query"]
        print(f"[{status}] Query: {query:40} -> normalized: {normalized:20} "
              f"-> Chunk {retrieved_idx} (expected {expected_chunk}), Sim: {sim:.4f}")

    print(f"\nQuestion forms: {passed}/{len(test_cases)} passed")
    return passed == len(test_cases)


def test_cross_query_consistency():
    """Verify different forms of same question produce identical similarity scores."""
    print("\n" + "=" * 80)
    print("TEST 3: Cross-Query Consistency (identical similarity)")
    print("=" * 80)

    index = TfidfIndex()
    index.fit(SAMPLE_CHUNKS)
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    retriever = RetrieverService(index, config=config)

    # These should all produce identical similarity scores
    variants = [
        "negasi",
        "apa itu negasi",
        "apa yang dimaksud negasi",
        "jelaskan negasi",
    ]

    similarities = []
    for query in variants:
        result = retriever.retrieve_with_relevance(query, top_k=1)
        if result["results"]:
            sim = result["results"][0]["similarity"]
            similarities.append(sim)
            print(f"  Query: {query:40} -> Similarity: {sim:.6f}")

    # Check if all similarities are the same
    if similarities:
        all_same = all(abs(s - similarities[0]) < 1e-6 for s in similarities)
        status = "PASS" if all_same else "FAIL"
        print(f"\n[{status}] All variants produce identical similarity: {all_same}")
        return all_same
    else:
        print("\n[FAIL] No results retrieved")
        return False


def test_unrelated_queries():
    """Verify unrelated queries are rejected by threshold."""
    print("\n" + "=" * 80)
    print("TEST 4: Unrelated Queries (properly rejected)")
    print("=" * 80)

    index = TfidfIndex()
    index.fit(SAMPLE_CHUNKS)
    config = RetrievalConfig(similarity_threshold=0.20, top_k=3)
    retriever = RetrieverService(index, config=config)

    unrelated = [
        "bagaimana cara memasak nasi goreng",
        "apa nama ibu kota Indonesia",
        "siapa presiden Amerika Serikat",
        "berapa harga sepatu Nike di mall",
        "apa resep membuat kue coklat",
    ]

    passed = 0
    for query in unrelated:
        result = retriever.retrieve_with_relevance(query, top_k=1)
        is_rejected = not result["relevant"]
        status = "PASS" if is_rejected else "FAIL"
        passed += 1 if is_rejected else 0

        if result["results"]:
            top_sim = result["results"][0]["similarity"]
            print(f"[{status}] Query: {query:45} -> rejected, top_sim: {top_sim:.4f}")
        else:
            print(f"[{status}] Query: {query:45} -> rejected (no results)")

    print(f"\nUnrelated queries: {passed}/{len(unrelated)} properly rejected")
    return passed == len(unrelated)


if __name__ == "__main__":
    print("=" * 80)
    print("INTEGRATION TEST: Query Normalization End-to-End")
    print("=" * 80)

    results = []
    results.append(("Short queries", test_short_queries()))
    results.append(("Question forms", test_question_forms()))
    results.append(("Cross-query consistency", test_cross_query_consistency()))
    results.append(("Unrelated queries", test_unrelated_queries()))

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {name}")

    all_passed = all(p for _, p in results)
    print()
    if all_passed:
        print("[PASS] All integration tests passed!")
        sys.exit(0)
    else:
        print("[FAIL] Some tests failed")
        sys.exit(1)
