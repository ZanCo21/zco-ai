# Development Log — 2026-10-16 Upload Progress, Extraction Preview, Suggested Questions, Study Mode

## Summary
Four features from the designs in `docs/desain/`: real upload/processing progress in Add Knowledge, a knowledge detail page (file information / extracted text / chunks), suggested questions in Chat, and Study Mode (upload → extraction → LLM summary). Retrieval algorithm, thresholds and the chat RAG flow are unchanged.

## Analysis (before)
- `POST /api/upload` was one blocking request (temp file → worker `/convert` → `/process` → insert); the UI only knew "Adding…" and lost the worker's error text (`statusText` only).
- The chunker's `section` was discarded (`knowledge_chunk.metadata` always null); file size / page count were not stored; the original file was deleted after processing.
- No suggestions in chat; no study/summary feature. `FileUpload` advertised 50 MB while the server rejects > 25 MB.

## Changes
### 1. Upload progress & processing status
- `src/lib/knowledge-ingest.ts` (new): ingestion pipeline with stage callbacks `upload → extract → process → ready`; skips the insert when the client cancelled; keeps the original in `data/uploads/<id><ext>`.
- `src/lib/document-pipeline.ts` (new): upload validation (415 type / 413 size / 400 empty) + extraction via worker with readable errors (`PipelineError` carries the failing stage).
- `src/lib/ndjson-response.ts`, `src/lib/processing-events.ts`, `src/lib/stream-request.ts` (new): NDJSON progress streaming; client uses XMLHttpRequest for real upload-byte progress.
- `/api/upload?stream=1` streams events; plain JSON mode kept (edit dialog).
- `add-knowledge-modal.tsx` + `processing-progress.tsx` (new): 4-step stepper, percent from real events, per-stage error message, *Try again*, cancel.
- `src/lib/upload-constraints.ts` (new): 25 MB + extension allow-list shared by client and server (`FileUpload` now shows the real limit).

### 2. Extraction preview (knowledge detail)
- `/knowledge/[id]` + `knowledge-detail.tsx`: tabs **File information** (PDF preview, size, pages, upload date, language, word/chunk counts), **Extracted text** (*Correct text* → existing `PUT`, which re-chunks), **Knowledge chunks** (section, words).
- `GET /api/knowledge/:id/file`: original upload; PDF inline, everything else as download, `nosniff`; path built from our own `<uuid><ext>` name only.
- Schema: nullable `knowledge.metadata` (JSON: `fileSize`, `pageCount`, `wordCount`, `language`, `storedFile`), added at startup to existing DBs (`src/db/index.ts`); chunk metadata stores `{section}` (`knowledge-store.ts`). DELETE removes the stored file.
- Worker `/convert` also returns `page_count`, `word_count`, `language`; `/process` returns `word_count`, `language` (`ai-worker/language.py`, new).
- Knowledge table: detail button (replaces the eye/view button).

### 3. Suggested questions
- `ai-worker/suggestions.py` (new) + `/suggest`: candidates from definitions ("MCAR (…)", "X adalah …"), headings and salient document terms, in the document's language. Each candidate must pass the **existing** relevance gate and rank a chunk of its own document first, so a clicked suggestion is answerable. Seeded shuffle → varies per request; per-round check cap so an unanswerable document (e.g. a duplicate upload) cannot use up the budget.
- `GET /api/suggestions`, chips above the chat input (click = send, refresh).

### 4. Study Mode
- `/study` (sidebar *Study Mode*): drop zone (click, keyboard, drag-and-drop) → `/api/study/extract` (same extraction pipeline, NDJSON, nothing stored) → material ready (pages, words, language, text preview) → *Create material summary*.
- `/api/study/summary` + `src/lib/study.ts`: abstractive summarization with Ollama. ≤ 2,500 words single pass; longer material map-reduce (worker chunker with 1,500–2,500-word sections → grounded notes per section → JSON summary via Ollama `format` schema). Prompts forbid information outside the text; `groundSummary` drops key concepts whose term does not occur in the source. Progress per section is streamed. Limit 30,000 words. Export as Markdown.
- `src/lib/ollama.ts`: optional `format`, `temperature`, `signal`; chat defaults unchanged; Ollama error body surfaced.

### Other
- shadcn `tabs`, `progress` added via CLI.
- `tsconfig.json`: `allowImportingTsExtensions` (TS unit tests import `.ts` directly under `node --experimental-strip-types`).
- `CLAUDE.md`: endpoints, NDJSON pattern, storage/metadata, UI/Study Mode notes, structure.

## Validation
- `uv run pytest tests` → 200 passed, 6 skipped (new: `tests/unit/test_language_and_suggestions.py`, 12 tests incl. duplicate-document and "Berikut adalah" regressions).
- `node --experimental-strip-types --test tests/unit/test_processing_and_study.test.ts` → 8 passed (NDJSON parsing, progress %, upload validation, section sizing, summary parsing/grounding, Markdown export). `tests/unit/test_knowledge_validation.mjs` → 5 passed.
- `npx tsc --noEmit`, `pnpm lint`, `pnpm build` clean.
- E2E on a copy of the DB (worker :8002, `next start` :3001, Ollama gemma3:4b), `EDA.pdf`:
  - `/api/upload?stream=1`: events arrive live (`extract started` 22:05:31.3 → `completed` 22:05:34.9), 56 chunks, metadata `{pageCount: 33, wordCount: 6418, language: "id", fileSize, storedFile}`, 54/56 chunks with section.
  - `/knowledge/:id` 200 (tabs, "33 pages", "Indonesian"), unknown id 404; `/file` → `application/pdf`, inline, nosniff; DELETE removes the stored file.
  - Errors: `.exe` → stream error at stage `upload`; empty file → 400.
  - `/api/suggestions`: 3 different questions per seed (e.g. "Apa itu MICE?", "Apa itu VIF?"); "Apa itu MAD?" sent to `/api/chat` → relevant (coverage path), answer cites the MAD formula from the document.
  - `/api/study/extract`: 33 pages, 6,418 words, `id`. `/api/study/summary`: 6 sections streamed one by one (~70–100 s each), compose, total 9 m 46 s; summary grounded in the text, 0 concepts dropped.
- Bugs found and fixed during E2E: suggestion budget drained by a duplicate document (only 1 of 3 returned); "Berikut adalah …" produced "Apa itu Berikut?"; empty upload returned 413; dynamic uploads path triggered a Turbopack whole-project trace warning; React Compiler lint errors in chat (setState in effect, `Date.now()` ids).

## Notes / known limitations
- A file named `.pdf` that is not a real PDF is "extracted" as its raw bytes by the existing MarkItDown fallback in `document_extraction.py` (pre-existing behaviour, left unchanged — out of scope).
- Entries uploaded before this change have no stored original / file metadata: the detail page shows the extracted text instead of a PDF preview and "—" for size/pages.
- Out of scope (not implemented): "Description" field and "Knowledge source" selector from the designs, per-chunk editing (corrections go through *Correct text*), stat cards.
- The `sop-devlog` skill was not available in this session; this log follows the existing devlog format.
