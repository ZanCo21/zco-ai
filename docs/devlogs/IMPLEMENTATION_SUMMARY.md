# RAG Pipeline Implementation - Summary

## Phase Completion Status

✓ Phase 3 (Preprocessing & Chunking)
✓ Phase 4A (TF-IDF Indexing)
✓ Phase 4B (Cosine Similarity Retrieval)
✓ Phase 4C (Relevance Threshold)
✓ Phase 5 (RAG Pipeline & API Integration)

## Files Created/Modified

### Database & Schema
- `src/db/schema.ts` - Drizzle ORM schema (Knowledge, KnowledgeChunk)
- `src/db/index.ts` - Database connection & initialization
- `drizzle.config.ts` - Drizzle configuration
- `data/app.db` - SQLite database (auto-created)

### Backend Services
- `src/lib/ai.ts` - Python worker communication (convert, process, retrieve)
- `src/lib/ollama.ts` - Ollama LLM integration & RAG prompt builder
- `src/lib/retrieval.ts` - Retrieval service wrapper (database + Python worker)

### API Endpoints
- `src/app/api/knowledge/route.ts` - POST (create), GET (list)
- `src/app/api/knowledge/[id]/route.ts` - GET (fetch), PUT (update), DELETE
- `src/app/api/upload/route.ts` - POST (upload file → knowledge)
- `src/app/api/retrieval/route.ts` - POST (retrieve + threshold)
- `src/app/api/chat/route.ts` - POST (RAG with Ollama)

### Python Worker Enhancement
- `ai-worker/main.py` - Added /retrieve endpoint

### Testing
- `scripts/integration-test.ts` - Integration test suite

## Architecture

### Complete RAG Flow

```
User Query
    ↓
[API] /api/chat
    ↓
retrieveFromKnowledge()
    ↓
Python Worker /retrieve
    ├── Build TF-IDF index from chunks
    ├── Query transformation
    ├── Cosine similarity ranking
    ├── Top-K selection
    └── Relevance threshold check
    ↓
Relevant? 
    ├── YES → Build context → Ollama → Answer + Sources
    └── NO → Return "Not Found" message
    ↓
API Response
    ↓
Frontend
```

### Knowledge Storage

```
Database (SQLite)
├── Knowledge
│   └── id, title, content, sourceType, filename, mimeType
│
└── KnowledgeChunk
    └── id, knowledgeId, chunkIndex, content, wordCount
```

## API Endpoints

### Knowledge Management

#### POST /api/knowledge
Create knowledge from text.

Request:
```json
{
  "title": "Panduan Beasiswa",
  "content": "Beasiswa untuk mahasiswa dengan IPK minimal 3.5..."
}
```

Response:
```json
{
  "id": "uuid",
  "title": "Panduan Beasiswa",
  "content": "..."
}
```

#### GET /api/knowledge
List all knowledge.

Response:
```json
{
  "items": [
    {"id": "uuid", "title": "...", "content": "..."}
  ]
}
```

#### GET /api/knowledge/:id
Fetch specific knowledge with chunks.

#### PUT /api/knowledge/:id
Update knowledge.

#### DELETE /api/knowledge/:id
Delete knowledge (cascades chunks).

### File Upload

#### POST /api/upload
Upload document, convert to Markdown, process, and save.

Request: multipart/form-data
- file: Document file (PDF, DOCX, TXT, etc.)
- title: Optional title

Response:
```json
{
  "id": "uuid",
  "title": "Document Title",
  "filename": "document.pdf",
  "chunksCreated": 5
}
```

### Retrieval Inspector

#### POST /api/retrieval
Test retrieval without calling Ollama. Shows raw ranking.

Request:
```json
{
  "query": "Apa persyaratan beasiswa?",
  "topK": 3
}
```

Response:
```json
{
  "query": "Apa persyaratan beasiswa?",
  "results": [
    {
      "knowledgeId": "uuid",
      "chunkId": "uuid",
      "chunkIndex": 0,
      "content": "Persyaratan IPK minimal 3.5...",
      "wordCount": 45,
      "similarity": 0.82
    }
  ],
  "threshold": 0.2,
  "maxSimilarity": 0.82,
  "relevant": true
}
```

### Chat (Main RAG)

#### POST /api/chat
Query with automatic retrieval, threshold check, and Ollama generation.

Request:
```json
{
  "message": "Apa persyaratan beasiswa?"
}
```

Response (if relevant):
```json
{
  "answer": "Persyaratan beasiswa adalah IPK minimal 3.5, surat rekomendasi, dan dokumen lengkap...",
  "sources": [
    {
      "knowledgeId": "uuid",
      "chunkId": "uuid",
      "title": "0",
      "similarity": 0.82
    }
  ],
  "retrieval": {
    "maxSimilarity": 0.82,
    "threshold": 0.2
  }
}
```

Response (if not relevant):
```json
{
  "answer": "Informasi yang diminta tidak ditemukan dalam knowledge base.",
  "sources": [],
  "retrieval": {
    "maxSimilarity": 0.08,
    "threshold": 0.2
  }
}
```

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=./data/app.db

# Python Worker
PYTHON_WORKER_URL=http://127.0.0.1:8001

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b

# Retrieval
SIMILARITY_THRESHOLD=0.20
TOP_K=3
```

## Running the System

### 1. Setup Database
```bash
pnpm drizzle-kit push
```

### 2. Start Python Worker
```bash
cd ai-worker
uv run python main.py
```

### 3. Start Next.js Dev Server
```bash
pnpm dev
```

### 4. Test Endpoints

Create knowledge:
```bash
curl -X POST http://localhost:3000/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Beasiswa IPK 3.5"}'
```

Test retrieval:
```bash
curl -X POST http://localhost:3000/api/retrieval \
  -H "Content-Type: application/json" \
  -d '{"query":"IPK beasiswa","topK":3}'
```

Test chat (requires Ollama):
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Apa persyaratan beasiswa?"}'
```

## Integration Test

```bash
npx ts-node scripts/integration-test.ts
```

Requirements:
- Python worker running on http://127.0.0.1:8001
- Next.js running on http://localhost:3000
- Ollama running on http://localhost:11434 (for /api/chat)

## Key Features

✓ **TF-IDF + Cosine Similarity** - Deterministic, academic retrieval
✓ **Configurable Threshold** - Prevent low-confidence generation
✓ **Chunking with Overlap** - Maintains document context
✓ **Heading Context** - Chunks carry section information
✓ **Multi-document Support** - Store & index multiple documents
✓ **Source Attribution** - Track which chunks contributed to answers
✓ **Relevance Inspection** - /api/retrieval endpoint for debugging
✓ **Threshold Protection** - Only calls Ollama when confident
✓ **Local-first** - No external APIs, all processing local
✓ **Type-safe** - Full TypeScript types throughout

## Not Implemented (As Specified)

✗ Vector embeddings (using TF-IDF instead)
✗ Vector database (using SQLite + TF-IDF)
✗ LangChain/LlamaIndex
✗ Multiple LLM providers
✗ User authentication
✗ Multi-user support
✗ Caching layer
✗ Real-time websockets

## Verification Checklist

- [x] Database schema created
- [x] Drizzle migrations pushed
- [x] Python worker /retrieve endpoint added
- [x] API routes implemented
- [x] TypeScript compilation passes
- [x] Services communicate correctly
- [x] Retrieval pipeline complete
- [x] Threshold checking integrated
- [x] RAG prompt generation ready
- [x] Source attribution working
- [x] Error handling in place
- [x] Configuration externalized
- [x] No hard-coded values

## Next Steps (Future Phases)

1. Frontend UI (React components for chat, knowledge management)
2. Authentication & authorization
3. Multi-user support
4. Evaluation metrics dashboard
5. API documentation (Swagger/OpenAPI)
6. Docker containerization
7. Production deployment
