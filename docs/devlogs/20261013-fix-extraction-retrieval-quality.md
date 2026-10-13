# Development Log — 2026-10-13 Extraction & Retrieval Quality

## Summary
Uploaded documents could not be answered reliably. Diagnosed with the real `EDA.pdf` (33 pages, tables, code, bullets) and fixed extraction, chunking, retrieval scoring/gating, generation prompt, and several API bugs found on the way. The similarity threshold was **not** lowered.

## Root causes (all reproduced on EDA.pdf)
1. **Extraction cleaner destroyed text.** `clean_extraction()` regex "fixed duplicate words" and rewrote `menganalisis`/`Analisis` to `is` (18 occurrences of "analisis" → 0), and de-duplicated *lines*, dropping repeated code/headers.
2. **Upload saved the temp file without extension**, so PDFs never reached the pdfplumber path; MarkItDown output was used (bullets detached from text, double spaces, page order swapped).
3. **Tables were flattened** column-interleaved (`MCAR Probabilitas data Sensor IoT mati Dampak:`), multi-page tables lost their header, page numbers leaked into sentences.
4. **Chunker joined every word with one space** — code, bullets and table rows became one blob; heading context only prepended raw.
5. **Cosine scale vs. fixed threshold.** Correct chunks were found (hit@3 14/17) but only 5/17 questions cleared 0.20 (a short question vs. a 150-word chunk scores ~0.1 even when all terms match). A hidden "halve the threshold for ≤3 words" hack existed instead of a real fix.
6. `normalize_query` existed only in tests; production retrieval never called it. Question words (`apa`, `bagaimana`, `jelaskan`…) were not stop words.
7. `/api/chat` hard-coded `3` / `0.2`; source `title` was the chunk index; `PUT /api/knowledge/:id` changed content but kept stale chunks; upload dereferenced `file.name` before the null check and stored `"Document: x.pdf"` garbage when the worker failed.
8. Prompt/ordering: gemma3:4b answered "not found" when the answering chunk was 3rd in the context.

## Changes
- `ai-worker/pdf_extractor.py` (new): pdfplumber, structure-aware PDF → Markdown (headings, bullets, fenced code, tables as `- Header: value | …` rows, cross-page table/row/sentence continuation, page numbers dropped).
- `ai-worker/document_extraction.py`: dispatcher (PDF → pdf_extractor, text → direct, others → MarkItDown, MarkItDown fallback for textless PDFs); non-destructive `normalize_text`; detects PDF by magic bytes when extension is missing; `original_filename` support.
- `ai-worker/chunking.py` / `preprocessing.py`: structure-preserving chunker (line breaks, atomic code/table rows, heading path per chunk, unit/word overlap), default 150/20 words; indentation preserved.
- `ai-worker/text_analysis.py` (new): tokenizer (identifiers, `z-score`, camelCase), EN+ID stop words incl. question words, light additive stemmer, bigrams.
- `ai-worker/tfidf_service.py`: smart analyzer, sparse matrix, no vocabulary cap, `term_coverage()`, `definition_match()`.
- `ai-worker/definitions.py` (new): definition intent + acronym-expansion / copular definition detection.
- `ai-worker/retrieval.py` / `config.py`: query normalization wired in, rank = cosine × coverage (× definition boost), two-path relevance gate (`SIMILARITY_THRESHOLD` unchanged; `COVERAGE_THRESHOLD`, `MIN_SIMILARITY` new), dynamic threshold halving removed, transparency fields.
- `ai-worker/query_normalizer.py`: strips trailing punctuation.
- `ai-worker/main.py`: passes `original_filename`, new config params, chunk defaults 150/20.
- `src/app/api/upload/route.ts`: keeps extension, allow-list + 25 MB limit (415/413), no garbage fallback for binary files (502), transactional insert.
- `src/app/api/knowledge/[id]/route.ts`: PUT re-chunks content in a transaction.
- `src/lib/config.ts` (new), `retrieval.ts`, `api/chat`, `api/retrieval`: env-driven TOP_K/thresholds, real source titles, trace fields.
- `src/lib/ollama.ts`: numbered sources, question before and after context, read-all-passages rule, `temperature 0.1`, `num_ctx 8192`.
- `src/components/chat/chat-interface.tsx`: show source title / ref instead of "Chunk #n".
- `.env.example`, `docker-compose.yml`, `CLAUDE.md`: new settings and architecture notes.
- Tests: `tests/conftest.py`, `tests/fixtures/{EDA.pdf,eda_questions.json}`, `tests/unit/*` (extraction, chunking, text analysis, gate, definitions), `tests/integration/test_eda_retrieval.py`, `tests/integration/test_e2e_chat.py` (opt-in via `ZCO_E2E_URL`). `pytest` added as dev dependency; `test_init_default` updated (`max_features` default is now `None`).

## Results on EDA.pdf (17 answerable + 5 unanswerable questions, threshold 0.20)
| | Before | After |
|---|---|---|
| "analisis" occurrences in extracted text (source: 18) | 0 | 18 |
| Questions passing the relevance gate | 5 / 17 | 17 / 17 |
| Correct chunk at rank 1 / in top-3 | 11 / 14 | 14 / 17 |
| Unanswerable questions wrongly accepted | 0 / 5 | 0 / 5 (+ 6 same-domain hard negatives rejected) |
| End-to-end answers correct & cited (Ollama gemma3:4b) | ≤ 5 reachable | 17 / 17 |
| Python test suite | 4 failed, 103 passed | 190 passed, 6 skipped (e2e opt-in) |

## Validation
- `uv run pytest tests` → 190 passed, 6 skipped. `npx tsc --noEmit` and `npx eslint src` clean.
- E2E (throw-away DB, worker :8011, Next :3011, real Ollama): `ZCO_E2E_URL=http://localhost:3011 uv run pytest tests/integration/test_e2e_chat.py` → 6 passed.
- Evaluated and rejected: Sastrawi stemmer (no gain, 45 s cold start, added noise), passage-level scoring (lower MRR), line-start boost (marginal).

## Notes
- Documents uploaded before this change were stored with corrupted text; **re-upload them**.
- Generic one-word queries ("data", "model") pass the gate by design (the term is in the KB); the LLM prompt still has to find an answer.
- The `sop-devlog` skill was not available in this session; this log follows the existing devlog format.
