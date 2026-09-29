# Query Normalization Fix

**Date:** 2026-09-29  
**Branch:** fix/query-normalization  
**Status:** Completed and tested

## Problem

Query `"negasi"` succeeded but `"apa yang dimaksud negasi"` failed with "Informasi yang diminta tidak ditemukan dalam knowledge base" despite identical intent.

**Root cause:** TF-IDF weight dilution. Question words ("apa", "dimaksud") added noise dimensions, spreading weight across multiple features instead of concentrating on core term ("negasi"). Different query forms produced different similarity vectors → threshold failed.

## Solution

**Query normalization pipeline** (general, not hardcoded):

1. Strip question prefixes: "apa itu X", "apa yang X", "apa yang dimaksud X"
2. Strip action verbs: "jelaskan X", "sebutkan X", "tuliskan X", "berikan X"
3. Strip filler suffixes: "X yang dimaksud", "X yang disebut"
4. Handle standalone question words: "apa", "siapa", "berapa", etc. → normalize to empty
5. Lowercase + clean whitespace

Applied **before** TF-IDF vectorization (in Python worker).

## Changes

### New Files
- `ai-worker/query_normalizer.py` — Normalization with regex patterns
- `tests/test_query_normalizer.py` — Unit tests (13 patterns verified)
- `tests/test_retrieval_normalization.py` — Retrieval integration test
- `tests/test_integration_retrieval.py` — End-to-end test (4 test suites, 19+ cases)

### Modified Files
- `ai-worker/tfidf_service.py` — Expanded stop words (add question words + fillers as fallback)
- `ai-worker/retrieval.py` — Import and apply `normalize_query()` in `RetrieverService.retrieve()`
  - Added `normalized_query` field to response dict
  - Dynamic threshold still applied based on normalized query length
- `src/lib/retrieval.ts` — Map `normalized_query` from Python response
- `src/app/api/chat/route.ts` — No changes (already uses normalized query from retrieval)

## Test Results

All tests pass:

1. **Query Normalizer Unit Tests** (13 patterns)
   - ✓ "apa itu negasi" → "negasi"
   - ✓ "apa yang dimaksud negasi" → "negasi"
   - ✓ "jelaskan negasi" → "negasi"
   - ✓ Standalone "apa" → "" (empty)

2. **Retrieval Integration** (10 question forms)
   - ✓ All variants of "negasi" query retrieve same chunk
   - ✓ Identical similarity scores across variants (0.4614)

3. **End-to-End** (4 suites, 19+ cases)
   - ✓ Short queries: 4/4 passed (negasi, konjungsi, disjungsi, implikasi)
   - ✓ Question forms: 10/10 passed (different formulations of negasi)
   - ✓ Cross-query consistency: identical similarity for all variants
   - ✓ Unrelated queries: 5/5 properly rejected by threshold

## Architecture

Query flow:
```
Client Query
  ↓
Next.js (unmodified)
  ↓
Python Worker
  ├─ Normalize query (strip question patterns)
  ├─ TF-IDF vectorization
  ├─ Cosine similarity
  ├─ Threshold check
  └─ Return (with normalized_query for transparency)
  ↓
Next.js Response (includes normalized_query)
  ↓
Client
```

Normalization is transparent to frontend; debugging visible via `normalized_query` field.

## Why This Works

- **General solution:** Not hardcoded for "negasi" — works for any Indonesian question form
- **Preserves accuracy:** Unrelated queries still rejected (5/5 test cases)
- **TF-IDF + Cosine Similarity:** Kept as primary retrieval method
- **Semantic equivalence:** "negasi" and "apa yang dimaksud negasi" normalize to same vector → same score
- **Backward compatible:** Short queries work unchanged

## Next Steps

- None required for retrieval robustness
- Optional: Extend patterns for additional question forms if discovered in real usage
- Optional: A/B test threshold if false negatives still occur

## Files Changed

- `ai-worker/query_normalizer.py` — NEW
- `ai-worker/tfidf_service.py` — MODIFIED (stop words)
- `ai-worker/retrieval.py` — MODIFIED (import + normalize)
- `src/lib/retrieval.ts` — MODIFIED (add normalized_query field)
- `tests/test_query_normalizer.py` — NEW
- `tests/test_retrieval_normalization.py` — NEW
- `tests/test_integration_retrieval.py` — NEW
