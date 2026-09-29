# Docker Setup Guide

## Quick Start

Build and run all services:

```bash
docker compose up --build
```

Access the application at `http://localhost:3000`

## Services

### app (Next.js)
- Port: 3000
- Health check: GET `/`
- Database: SQLite at `/app/data/app.db`
- Depends on: ai-worker, ollama

### ai-worker (Python)
- Port: 8001
- Health check: GET `/health`
- Endpoints: `/convert`, `/process`, `/retrieve`
- Depends on: ollama

### ollama (Local LLM)
- Port: 11434
- Health check: GET `/api/tags`
- Models persist in volume `ollama-models`

## Volumes

- `ollama-models`: Ollama model cache
- `./data`: SQLite database and uploads (host-mounted)

## Environment Variables

All services use Docker service names for inter-container communication:

- `PYTHON_WORKER_URL=http://ai-worker:8001` (Next.js to Python)
- `OLLAMA_URL=http://ollama:11434` (Next.js + Python to Ollama)

See `docker-compose.yml` for full configuration.

## Development vs Production

**Production** (current setup):
```bash
docker compose up --build
```

**Development** (local):
```bash
# Terminal 1: Next.js
pnpm dev

# Terminal 2: Python worker
uv run python ai-worker/main.py

# Terminal 3: Ollama (requires separate installation)
# Run Ollama separately and configure endpoints:
# PYTHON_WORKER_URL=http://localhost:8001
# OLLAMA_URL=http://localhost:11434
```

## First Run

Ollama will need to download the model on first startup. Check logs:

```bash
docker compose logs ollama
```

Wait for health check to pass before queries will work.

## Cleanup

Stop services:
```bash
docker compose down
```

Remove volumes (delete data):
```bash
docker compose down -v
```

## Troubleshooting

### Service not responding
Check health:
```bash
docker compose ps
```

View logs:
```bash
docker compose logs [service-name]
```

### Port conflicts
Change ports in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Host:Container
```

### Database locked
SQLite may need cleanup:
```bash
rm data/app.db*
docker compose restart app
```
