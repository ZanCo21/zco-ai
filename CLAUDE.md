@AGENTS.md

# zco-ai — Local Knowledge AI

## 1. Project Overview

zco-ai is a local-first AI knowledge application designed.

The application allows users to build and manage their own knowledge base through:

* Direct text input
* Document uploads
* Automatic document-to-Markdown conversion
* Text preprocessing and chunking
* TF-IDF indexing
* Cosine Similarity retrieval
* Local LLM generation through Ollama
* Source attribution
* Retrieval inspection
* Retrieval evaluation

The application runs locally and is accessed through a browser at:

```text
http://localhost:3000
```

"Local" means the application, database, document processing, retrieval pipeline, and LLM run on the user's machine. It does NOT mean the application must avoid a browser UI.

---

# 2. Core Architecture

The project uses a hybrid architecture.

```text
Browser
   |
   v
Next.js 16
   |
   +-- Route Handlers
   |
   +-- SQLite + Drizzle
   |
   +-- Python AI Worker
           |
           +-- MarkItDown
           +-- Preprocessing
           +-- Chunking
           +-- TF-IDF
           +-- Cosine Similarity
           |
           v
        Ollama
           |
           v
        Answer
```

## Responsibilities

### Next.js

Next.js is the main application.

Responsibilities:

* UI
* Routing
* API endpoints
* Knowledge CRUD
* File upload handling
* Database access
* Calling the Python AI worker
* Calling Ollama when appropriate
* Returning responses to the frontend

Use Next.js App Router.

Use Route Handlers for backend/API functionality.

Do not introduce FastAPI unless there is a concrete requirement that cannot reasonably be handled by Next.js Route Handlers.

---

# 3. Technology Stack

## Frontend

* Next.js 16
* React 19
* TypeScript
* Tailwind CSS
* shadcn/ui
* Radix UI primitives through shadcn/ui where applicable
* Lucide React for icons

### UI Library Policy

**shadcn/ui is the primary component library for the application UI.**

Use shadcn/ui components whenever a suitable component exists.

Examples:

* Button
* Input
* Textarea
* Label
* Select
* Checkbox
* Radio Group
* Switch
* Dialog
* Alert Dialog
* Dropdown Menu
* Sheet
* Tabs
* Card
* Table
* Badge
* Alert
* Tooltip
* Popover
* Command
* Breadcrumb
* Pagination
* Skeleton
* Progress
* Toast/Sonner
* Form

Components should be installed using the shadcn CLI rather than manually recreating equivalent components.

Example:

```bash
pnpm dlx shadcn@latest add button
```

For multiple components:

```bash
pnpm dlx shadcn@latest add button card input textarea
```

Do not install a large UI library such as Material UI, Ant Design, Chakra UI, or Mantine unless there is a specific architectural reason.

Do not introduce DaisyUI for this project.

Tailwind CSS remains the styling foundation.

---

## Frontend Forms

Use:

* React Hook Form
* Zod
* shadcn/ui Form components

Preferred pattern:

```text
React Hook Form
      +
Zod validation
      +
shadcn/ui Form
```

Keep validation schemas reusable between related client/server validation where practical.

---

## Icons

Use Lucide React for application icons.

Prefer:

```tsx
import { Search, Upload, Trash2 } from "lucide-react";
```

Avoid manually drawing SVG icons when an appropriate Lucide icon exists.

---

# 4. Backend/API

* Next.js Route Handlers
* TypeScript

Expected endpoints:

```text
POST   /api/knowledge
GET    /api/knowledge
GET    /api/knowledge/:id
PUT    /api/knowledge/:id
DELETE /api/knowledge/:id

POST   /api/upload

POST   /api/chat

POST   /api/retrieval
```

---

# 5. Database

Use:

* SQLite
* Drizzle ORM

The database is local and should initially be stored under:

```text
data/app.db
```

Do not introduce PostgreSQL unless there is a clear project requirement.

Do not introduce a vector database for the initial implementation.

---

# 6. Python AI Worker

Python is responsible for AI/NLP/document-processing tasks.

Use:

* Python 3.12
* uv
* MarkItDown
* scikit-learn
* NumPy

Python worker responsibilities:

```text
Document
   |
   v
MarkItDown
   |
   v
Markdown
   |
   v
Cleaning
   |
   v
Chunking
   |
   v
TF-IDF
   |
   v
Retrieval
```

Python should NOT become a second general-purpose backend.

Keep the Python worker focused on document processing, NLP, retrieval, and AI-related processing.

---

# 7. MarkItDown

MarkItDown is used for document ingestion.

Typical flow:

```text
PDF / DOCX / PPTX / XLSX / HTML / etc.
                    |
                    v
                MarkItDown
                    |
                    v
                 Markdown
```

Do not treat MarkItDown as an AI model.

Its purpose is document conversion and extraction.

Prefer the Python API when integrating it into the application.

Example:

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert(file_path)

markdown = result.markdown
```

---

# 8. Text Processing

After conversion:

```text
Raw Markdown
    |
    v
Cleaning
    |
    v
Normalization
    |
    v
Chunking
```

Do not send entire large documents directly to Ollama.

Documents must be split into meaningful chunks.

Each chunk should retain metadata such as:

* knowledge ID
* chunk index
* source filename
* section information when available
* word count

---

# 9. Retrieval System

The initial retrieval system MUST use:

* TF-IDF
* Cosine Similarity

Do not replace this with embeddings or a vector database during the initial implementation.

The retrieval flow is:

```text
User Question
      |
      v
TF-IDF Vectorizer
      |
      v
Query Vector
      |
      v
Cosine Similarity
      |
      v
Ranked Chunks
      |
      v
Top-K
```

Example:

```text
Chunk A    0.82
Chunk B    0.71
Chunk C    0.43
Chunk D    0.09
```

The highest similarity chunks should be selected as context.

---

# 10. Relevance Threshold

The system should have a configurable similarity threshold.

Example:

```text
SIMILARITY_THRESHOLD=0.20
```

If:

```text
max_similarity >= threshold
```

continue to the LLM.

If:

```text
max_similarity < threshold
```

do not ask Ollama to invent an answer.

Return a response indicating that the requested information was not found in the knowledge base.

The threshold must be configurable rather than hard-coded throughout the application.

---

# 11. Ollama

Ollama is the local LLM runtime.

Expected local endpoint:

```text
http://localhost:11434
```

The model should be configurable using environment variables.

Example:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
```

Do not hard-code the model name throughout the source code.

---

# 12. RAG Pipeline

The application implements a lightweight RAG architecture.

The complete flow is:

```text
                 INGESTION

Document / Text
      |
      v
MarkItDown
      |
      v
Markdown
      |
      v
Cleaning
      |
      v
Chunking
      |
      v
Knowledge Chunks
      |
      v
TF-IDF Index


                 QUERY

User Question
      |
      v
TF-IDF Query Vector
      |
      v
Cosine Similarity
      |
      v
Top-K Chunks
      |
      v
Similarity Threshold
      |
      +------ insufficient ------> Not Found
      |
      v
Relevant Context
      |
      v
Ollama
      |
      v
Answer + Sources
```

---

# 13. Anti-Hallucination Rules

The LLM must not be treated as the source of truth.

The knowledge base is the source of truth.

The prompt sent to Ollama should instruct the model to:

1. Answer using only the retrieved context.
2. Not invent information.
3. Clearly state when the answer cannot be found.
4. Preserve uncertainty when the retrieved context is insufficient.
5. Prefer concise factual answers.
6. Reference the retrieved source documents.

The retrieval threshold must be checked before generation.

---

# 14. Database Model

Initial database design:

## Knowledge

Fields:

```text
id
title
content
source_type
original_filename
mime_type
created_at
updated_at
```

Possible source types:

```text
text
file
```

## KnowledgeChunk

Fields:

```text
id
knowledge_id
chunk_index
content
word_count
metadata
created_at
```

Relationship:

```text
Knowledge 1 ---- N KnowledgeChunk
```

Additional metadata can be added when required.

Do not overcomplicate the schema prematurely.

---

# 15. File Storage

Uploaded files should initially be stored locally.

Suggested structure:

```text
data/
├── app.db
└── uploads/
```

Do not introduce S3, MinIO, or cloud storage for the initial version.

The project is intentionally local-first.

---

# 16. UI Structure

The UI should be more than a basic chatbot.

Recommended navigation:

```text
Chat
Knowledge
Documents
Retrieval
Evaluation
Settings
```

## UI Design Principles

Use **shadcn/ui as the default component system**.

Prefer composition of shadcn/ui primitives over building custom components from scratch.

Examples:

```text
Card
 ├── CardHeader
 ├── CardTitle
 ├── CardDescription
 └── CardContent
```

For dialogs:

```text
Dialog
 ├── DialogTrigger
 ├── DialogContent
 ├── DialogHeader
 ├── DialogTitle
 ├── DialogDescription
 └── DialogFooter
```

For forms:

```text
Form
 ├── FormField
 ├── FormItem
 ├── FormLabel
 ├── FormControl
 ├── FormDescription
 └── FormMessage
```

For data:

```text
Table
 ├── TableHeader
 ├── TableBody
 ├── TableRow
 └── TableCell
```

Use Tailwind utility classes for layout and custom styling.

Avoid excessive custom CSS unless Tailwind utilities cannot reasonably express the requirement.

---

## Visual Style

The application should have a clean, modern, professional developer-tool/dashboard appearance.

Prioritize:

* clear spacing
* readable typography
* consistent border radius
* accessible contrast
* responsive layouts
* meaningful empty states
* loading states
* error states
* keyboard accessibility
* consistent icon usage

Do not add excessive gradients, animations, glassmorphism, or decorative effects unless explicitly requested.

The UI should feel like a serious AI knowledge management application rather than a generic landing page.

---

## Chat

Show:

* user question
* AI answer
* source documents
* similarity score when appropriate
* loading state
* error state

Example:

```text
Answer

Berdasarkan knowledge base...

Sources

Panduan Beasiswa.pdf
Similarity: 0.82

Pedoman Akademik.pdf
Similarity: 0.71
```

Use shadcn/ui components such as:

* Card
* ScrollArea
* Badge
* Button
* Textarea
* Skeleton
* Separator

---

## Knowledge

Allow users to:

* create knowledge manually
* edit knowledge
* delete knowledge
* search knowledge
* inspect knowledge content

Recommended shadcn/ui components:

* Card
* Input
* Textarea
* Button
* Dialog
* Alert Dialog
* Badge
* Table
* Dropdown Menu
* Pagination

---

## Documents

Allow users to:

* upload files
* inspect processing status
* view original filename
* view extracted Markdown
* view generated chunks

Processing status can be:

```text
Uploading
Converting
Extracting
Chunking
Indexing
Completed
Failed
```

Recommended shadcn/ui components:

* Card
* Progress
* Badge
* Table
* Dialog
* Alert
* Skeleton
* Button

---

## Retrieval

Provide an AI retrieval inspector.

Show:

```text
Query

"Apa persyaratan beasiswa?"

Retrieved Chunks

1. Panduan Beasiswa
   Similarity: 0.82

2. Pedoman Akademik
   Similarity: 0.71

3. FAQ
   Similarity: 0.43
```

Recommended shadcn/ui components:

* Card
* Input
* Button
* Badge
* Table
* Accordion
* ScrollArea

This page is important for demonstrating that the application actually performs TF-IDF and Cosine Similarity retrieval.

---

## Evaluation

Provide retrieval evaluation.

Initial metrics:

```text
Hit Rate@1
Hit Rate@3
Precision@K
Recall@K
Average Similarity
```

Recommended shadcn/ui components:

* Card
* Table
* Badge
* Progress
* Tabs

The evaluation dataset can contain:

```text
Question
Expected Source
Expected Chunk
```

---

# 17. Project Structure

Preferred structure:

```text
zco-ai/
│
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── chat/
│   │   ├── knowledge/
│   │   ├── documents/
│   │   ├── retrieval/
│   │   ├── evaluation/
│   │   ├── settings/
│   │   │
│   │   └── api/
│   │       ├── knowledge/
│   │       ├── upload/
│   │       ├── chat/
│   │       └── retrieval/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   │   └── sidebar.tsx
│   │   ├── chat/
│   │   │   └── chat-interface.tsx
│   │   └── knowledge/
│   │       ├── knowledge-table.tsx
│   │       ├── file-upload.tsx
│   │       ├── add-knowledge-modal.tsx
│   │       ├── update-knowledge-modal.tsx
│   │       ├── delete-knowledge-modal.tsx
│   │       └── view-knowledge-modal.tsx
│   │
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   │
│   └── lib/
│       ├── ai.ts
│       ├── retrieval.ts
│       ├── python-worker.ts
│       └── validations/
│           └── knowledge.ts
│
├── ai-worker/
│   ├── main.py
│   ├── markitdown_service.py
│   ├── preprocessing.py
│   ├── chunking.py
│   ├── tfidf_service.py
│   ├── retrieval.py
│   └── ollama.py
│
├── data/
│   ├── app.db
│   └── uploads/
│
├── drizzle/
│
├── public/
│
├── components.json
├── .env
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── package.json
├── pyproject.toml
└── CLAUDE.md
```

`src/components/ui/` contains shadcn/ui generated components.

Do not modify shadcn/ui components unnecessarily.

If application-specific behavior is required, compose shadcn/ui primitives into feature components instead of heavily modifying generated primitives.

---

# 18. Environment Variables

Expected `.env`:

```env
DATABASE_URL=./data/app.db

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b

PYTHON_WORKER_URL=http://127.0.0.1:8001

SIMILARITY_THRESHOLD=0.20
TOP_K=3
```

Keep `.env` out of Git.

Provide `.env.example` for configuration documentation.

---

# 19. Development Commands

Frontend:

```bash
pnpm dev
```

Python:

```bash
uv run python ai-worker/main.py
```

Database:

```bash
pnpm drizzle-kit push
```

shadcn/ui:

```bash
pnpm dlx shadcn@latest add <component>
```

The final developer experience should eventually support:

```bash
pnpm dev:all
```

which starts the Next.js application and Python worker together.

Ollama should remain a separately installed local service.

---

# 20. Development Principles

## Keep the architecture simple

Do NOT add the following unless there is a concrete requirement:

* Kubernetes
* Kafka
* Redis
* PostgreSQL
* Elasticsearch
* Pinecone
* Weaviate
* Qdrant
* FAISS
* Docker
* AWS
* S3
* FastAPI
* Material UI
* Ant Design
* Chakra UI
* Mantine
* DaisyUI

The initial goal is a strong local AI application, not a distributed production system.

---

# 21. Important Engineering Principles

Prefer:

* TypeScript strict typing
* small reusable components
* shadcn/ui primitives
* Tailwind CSS utilities
* accessible components
* consistent UI patterns
* clear service boundaries
* validation of API input
* proper error handling
* meaningful HTTP status codes
* environment-based configuration
* reusable Python services
* deterministic retrieval
* testable functions

Avoid:

* huge components
* duplicated logic
* hard-coded configuration
* calling Ollama directly from many places
* secrets in source code
* unnecessary abstractions
* premature optimization
* manually rebuilding components already provided by shadcn/ui

---

# 22. API Boundary

The architecture should maintain this boundary:

```text
Next.js
   |
   | application/API/database
   |
   v
Python Worker
   |
   | document/NLP/retrieval processing
   |
   v
Ollama
```

Do not duplicate TF-IDF logic in TypeScript.

Do not duplicate document processing in Next.js.

Python owns NLP/retrieval.

Next.js owns application orchestration and UI.

---

# 23. Source Attribution

Every AI response should attempt to expose its sources.

A source should contain information such as:

```text
source:
    knowledge_id
    title
    filename
    chunk_id
    similarity
```

The frontend should display the source information beneath or beside the answer.

---

# 24. Retrieval Transparency

The application should make the retrieval process observable.

For debugging and educational purposes, expose:

```text
query
top_k
threshold
retrieved_chunks
similarity_scores
```

This allows users and evaluators to understand how the answer was generated.

---

# 25. Security

Uploaded documents should be treated as untrusted input.

Do not execute uploaded files.

Restrict file access to the application.

Validate:

* file size
* file extension
* MIME type when possible
* filename
* storage path

Do not expose arbitrary filesystem paths to the browser.

MarkItDown performs file I/O using the privileges of the process, so input handling must be appropriately restricted.

---

# 26. Testing Strategy

Semua automated test WAJIB berada di folder `tests/`.

Struktur:

```text
tests/
├── unit/
├── integration/
└── fixtures/
```

Minimum coverage:

* **MarkItDown:** PDF, DOCX, TXT → Markdown
* **Preprocessing & Chunking:** empty, short, large, paragraph/heading boundaries
* **TF-IDF & Retrieval:** relevant, irrelevant, multiple relevant, low similarity
* **Relevance Threshold:** threshold behavior dan edge cases
* **RAG Pipeline:** retrieval → context → Ollama
* **API:** CRUD, upload, chat, retrieval
* **UI:** validation, loading, empty, error, dialog, responsive

Test WAJIB dijalankan setelah perubahan kode yang relevan. Jangan mengklaim test berhasil jika belum benar-benar dijalankan.

### Development Log (WAJIB — setiap prompt yang mengubah kode)

**PENTING: Aturan ini berlaku untuk SEMUA prompt.**

Setiap kali selesai mengerjakan prompt yang mengubah kode, WAJIB:

1. Load skill `sop-devlog`
2. Update `docs/devlogs/<YYYYMMDD>-<nama_branch>.md`
3. Commit devlog bersama kode perubahan

Contoh prompt ad-hoc yang TETAP harus update devlog:

* "buatkan library untuk handle PDF" → kode berubah → update devlog
* "install package redis dan buat wrapper-nya" → kode berubah → update devlog

**Skip HANYA untuk:** fix typo, rename variabel, formatting saja.

### Update CLAUDE.md (WAJIB — setiap prompt yang mengubah kode)

**PENTING: Aturan ini berlaku untuk SEMUA prompt.**

Setiap kali selesai mengerjakan prompt yang mengubah kode, cek apakah `CLAUDE.md` perlu di-update.

Update secara incremental melalui `Edit`, **JANGAN full regenerate**:

* Module/model/view/service/URL baru → update **Module Map**
* Shared component baru → update **Shared UI Components**
* Entry point navigasi baru → update **Integration Points**
* API pattern berubah → update **API Patterns**
* Layout/blocks berubah → update **Template & Layout**
* Dependency baru di-install → update **Tech Stack** dan **Core Libraries**
* Folder/struktur baru dibuat → update **Struktur Direktori**

**Skip HANYA untuk:** bug fix tanpa ubah struktur, tambah test, rename variabel, fix typo, formatting.


---

# 27. Implementation Order

Implement in this order:

## Phase 1

```text
Next.js
SQLite
Drizzle
Tailwind
shadcn/ui
Basic UI
```

## Phase 2

```text
Knowledge CRUD
```

## Phase 3

```text
File upload
MarkItDown
Markdown extraction
```

## Phase 4

```text
Chunking
TF-IDF
Cosine Similarity
```

## Phase 5

```text
Ollama
Prompt
RAG pipeline
```

## Phase 6

```text
Sources
Retrieval Inspector
```

## Phase 7

```text
Evaluation
Hit Rate@K
Precision@K
Recall@K
```

## Phase 8

```text
UI polish
Error handling
Loading states
Documentation
```

---

# 28. Definition of Done

The project is considered functional when a user can:

1. Open the application at `localhost:3000`.
2. Add knowledge using text.
3. Upload a supported document.
4. Convert the document using MarkItDown.
5. Store the resulting content.
6. Split the content into chunks.
7. Build/use a TF-IDF representation.
8. Search using Cosine Similarity.
9. Retrieve the most relevant chunks.
10. Reject low-relevance queries using a threshold.
11. Send relevant context to Ollama.
12. Receive an answer based on the retrieved context.
13. See the source documents/chunks used.
14. Inspect retrieval scores.
15. Run retrieval evaluation.

---

# 29. Non-Goals

The initial version is NOT intended to be:

* a cloud SaaS
* a distributed system
* a Kubernetes application
* a production-scale enterprise RAG platform
* a vector database benchmark
* a multi-user authentication platform

The primary goal is to demonstrate a complete, understandable, locally runnable AI/RAG system using classical information retrieval combined with a local LLM.

---

# 30. AI Concept

The central AI concept of this project is:

```text
Classical Information Retrieval
+
Local Large Language Model
=
Lightweight Local RAG
```

The academic contribution should be visible in the retrieval process:

```text
TF-IDF
   +
Cosine Similarity
   +
Top-K Retrieval
   +
Similarity Threshold
   +
Ollama
```

The system should therefore not be described merely as "a chatbot."

It is a:

**Local Knowledge Retrieval and Generation System**

with an explicit document ingestion, retrieval, and generation pipeline.
