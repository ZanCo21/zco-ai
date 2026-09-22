# znco run - Development Environment Orchestrator

## Overview

`znco run` is a lightweight process orchestrator that starts the complete LocalMind development stack with a single command:

```bash
pnpm znco
```

or

```bash
pnpm znco run
```

## What It Does

Starts three services concurrently:

1. **Next.js** → `http://localhost:3000`
2. **Python Worker** → `http://127.0.0.1:8001`
3. **Ollama** → `http://localhost:11434` (if running)

## Usage

### Start Development Stack

```bash
pnpm znco
```

Expected output:

```
╔══════════════════════════════════════════════╗
║              LocalMind                       ║
║          Development Environment             ║
╚══════════════════════════════════════════════╝

[12:34:56] [znco] Starting services...

[12:34:56] [Python] Starting with: uv run python ai-worker/main.py
[12:34:57] [Python] Worker starting on 127.0.0.1:8001
[12:34:58] [znco] ✓ Python Worker ready → http://127.0.0.1:8001

[12:34:58] [znco] ✓ Ollama already running → http://localhost:11434

[12:34:58] [Next.js] Starting with: pnpm dev
[12:34:59] [Next.js] ▲ Next.js 16...
[12:35:00] [Next.js] - Local: http://localhost:3000
[12:35:00] [znco] ✓ Next.js ready → http://localhost:3000

[12:35:00] [znco] ✓ All services started
[12:35:00] [znco] Press Ctrl+C to shutdown
```

### Stop Development Stack

Press `Ctrl+C`:

```
^C

[12:35:45] [znco] Shutting down...

[12:35:45] [znco] Stopping Next.js...
[12:35:45] [znco] Stopping Python Worker...

[12:35:47] [znco] Cleaning development cache...

✓ Removed .next
✓ Removed Python __pycache__

[12:35:47] [znco] ✓ Cache cleanup completed (2 items removed)

[12:35:47] [znco] Shutdown complete.
```

## Features

### ✓ Concurrent Process Management

All services start in parallel, not sequentially. The orchestrator waits for health checks before declaring startup complete.

### ✓ Health Checks

Before declaring services "ready", `znco` checks:

- **Next.js**: HTTP GET `http://localhost:3000/`
- **Python Worker**: HTTP GET `http://127.0.0.1:8001/health`
- **Ollama**: HTTP GET `http://localhost:11434/api/tags`

If a service fails to respond within the timeout, startup is aborted.

### ✓ Ollama Ownership Tracking

**If Ollama is already running:**
- `znco` detects it and reuses the existing instance
- Marked as "not owned" (external)
- On `Ctrl+C`, Ollama is NOT terminated
- Only Next.js + Python Worker are stopped

**If Ollama is not running:**
- `znco` displays message to start it manually in another terminal
- Does not force-start Ollama
- Continues with Next.js + Python Worker
- Chat functionality will not work without Ollama, but other features work

### ✓ Port Conflict Detection

Checks if ports are available before starting services:

```
Port 3000   → Next.js
Port 8001   → Python Worker
Port 11434  → Ollama
```

If port is occupied, displays clear error:

```
[znco] Port 8001 is already in use
[znco] Python Worker failed to start
```

### ✓ Graceful Shutdown

Handles `Ctrl+C` properly:

1. Stops Next.js (SIGTERM)
2. Stops Python Worker (SIGTERM)
3. Stops Ollama if owned (SIGTERM)
4. Waits for process termination (2 seconds)
5. Force-kills any remaining processes (SIGKILL)
6. Cleans up development cache
7. Exits cleanly

### ✓ Development Cache Cleanup

On shutdown, cleans up disposable cache:

```
.next/
ai-worker/__pycache__/
.pytest_cache/
.mypy_cache/
```

**Does NOT delete:**
- `data/app.db` (application database)
- `data/uploads/` (user-uploaded files)
- `.env` files
- Source code

### ✓ Cross-Platform

Uses Node.js child_process API for cross-platform compatibility:

- Works on Windows, macOS, Linux
- No shell-specific commands (no `bash`, `cmd.exe`, etc.)
- Proper signal handling (SIGTERM, SIGKILL)

### ✓ Colored Output with Prefixes

Clear logging helps identify which service produced output:

```
[12:35:00] [Next.js]   ▲ Next.js 16...
[12:35:00] [Python]    Worker starting on 127.0.0.1:8001
[12:35:00] [znco]      ✓ Python Worker ready
```

Color coding:
- **Green**: Success
- **Yellow**: Warning
- **Red**: Error
- **Dim**: Service output

## Implementation

**Files Created:**
- `scripts/run.js` — Main orchestrator (Node.js, no external dependencies)

**Files Modified:**
- `package.json` — Added `"znco": "node scripts/run.js"` script

**Architecture:**
- Pure Node.js (no external process managers)
- Uses `child_process.spawn()`
- HTTP health checks via `http.request()`
- File system operations via `fs.rmSync()`
- Idempotent shutdown handler

## Startup Order

```
znco run
  │
  ├─→ Check Ollama
  │    ├─ Running → Reuse (not owned)
  │    ├─ Not running → Skip (external service)
  │    └─ Port conflict → Error
  │
  ├─→ Start Python Worker (port 8001)
  │    ├─ Port available
  │    ├─ Spawn process
  │    ├─ Wait for /health endpoint
  │    └─ Health check timeout → Error
  │
  ├─→ Start Next.js (port 3000)
  │    ├─ Port available
  │    ├─ Spawn process
  │    ├─ Wait for HTTP response
  │    └─ Health check timeout → Error
  │
  └─→ All ready → Display banner + "Press Ctrl+C"
```

## Environment Variables

`znco` respects existing `.env` configuration:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
PYTHON_WORKER_URL=http://127.0.0.1:8001
SIMILARITY_THRESHOLD=0.20
TOP_K=3
```

These are passed to child processes automatically.

## Troubleshooting

### Port already in use

```
[znco] Port 3000 is already in use
[znco] Next.js failed to start
```

**Solution:** Stop the conflicting process or use different ports.

### Python Worker health check fails

```
[znco] Python Worker failed to start
```

**Solutions:**
- Check if `uv` is installed: `uv --version`
- Check Python version: `python --version` (requires 3.12+)
- Check for errors in Python output

### Next.js health check fails

```
[znco] Next.js failed to start
```

**Solutions:**
- Check if `pnpm` is installed: `pnpm --version`
- Check for errors in Next.js output
- Verify `src/app/page.tsx` exists

### Ollama port conflict

```
[znco] Port 11434 is occupied by another process (not Ollama)
```

**Solution:** Stop the conflicting process or start Ollama manually on different port.

## Manual Alternative

If `znco run` doesn't work, start services manually in separate terminals:

**Terminal 1 - Next.js:**
```bash
pnpm dev
```

**Terminal 2 - Python Worker:**
```bash
uv run python ai-worker/main.py
```

**Terminal 3 - Ollama (optional):**
```bash
ollama serve
```

## Implementation Notes

- **No external dependencies**: Uses only Node.js stdlib + npm packages already in project
- **Lightweight**: ~200 lines of code
- **Maintainable**: Single file, clear responsibilities
- **Observable**: All process output visible with clear prefixes
- **Safe**: Properly handles process cleanup, no orphan processes
- **Smart**: Detects Ollama ownership, doesn't force-kill external processes

## Future Enhancements (Not Implemented)

- Docker support (`docker-compose`)
- PM2 integration
- Custom port configuration
- Selective service startup (`znco run --no-ollama`)
- Service restart on crash
- Log file persistence
