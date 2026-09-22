#!/usr/bin/env node

/**
 * znco run - LocalMind Development Environment Orchestrator
 * Starts Next.js, Python Worker, and Ollama concurrently
 * Handles graceful shutdown with cache cleanup
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { request } from "http";

const projectRoot = join(__dirname, "..");

interface ProcessConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

interface ManagedProcess {
  name: string;
  process: ChildProcess | null;
  owned: boolean;
}

const managedProcesses = new Map<string, ManagedProcess>();
let isShuttingDown = false;

// Cache paths to cleanup on shutdown
const CACHE_PATHS = [
  ".next",
  "ai-worker/__pycache__",
  ".pytest_cache",
  ".mypy_cache",
];

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(prefix: string, message: string, color: string = colors.reset) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${color}[${timestamp}] [${prefix}] ${message}${colors.reset}`);
}

function banner() {
  console.log(
    `${colors.bright}${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║              LocalMind                       ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}║          Development Environment             ║${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`
  );
  console.log();
}

function checkHealth(
  host: string,
  port: number,
  path: string = "/",
  timeout: number = 3000
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: host,
        port,
        path,
        method: "GET",
        timeout,
      },
      (res) => {
        resolve(res.statusCode ? res.statusCode < 400 : false);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function waitForService(
  host: string,
  port: number,
  path: string = "/",
  maxAttempts: number = 10
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkHealth(host, port, path, 2000)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function checkOllamaRunning(): Promise<boolean> {
  return checkHealth("localhost", 11434, "/api/tags", 2000);
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require("net");
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function spawnProcess(config: ProcessConfig): ChildProcess {
  log(config.name, `Starting with: ${config.command} ${config.args.join(" ")}`);

  const proc = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: { ...process.env, ...config.env },
    stdio: ["inherit", "pipe", "pipe"],
  });

  // Handle stdout
  proc.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.log(`${colors.dim}[${config.name}]${colors.reset}    ${line}`);
      }
    });
  });

  // Handle stderr
  proc.stderr?.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.error(
          `${colors.yellow}[${config.name}]${colors.reset}    ${line}`
        );
      }
    });
  });

  proc.on("error", (err) => {
    log(config.name, `Error: ${err.message}`, colors.red);
  });

  proc.on("close", (code) => {
    if (!isShuttingDown) {
      log(
        config.name,
        `Exited with code ${code}`,
        code === 0 ? colors.green : colors.red
      );
    }
  });

  return proc;
}

async function startNextJs(): Promise<boolean> {
  const portAvailable = await checkPortAvailable(3000);
  if (!portAvailable) {
    log("znco", "Port 3000 is already in use", colors.red);
    return false;
  }

  const proc = spawnProcess({
    name: "Next.js",
    command: "pnpm",
    args: ["dev"],
    cwd: projectRoot,
    env: { NODE_ENV: "development" },
  });

  managedProcesses.set("nextjs", { name: "Next.js", process: proc, owned: true });

  const ready = await waitForService("localhost", 3000, "/", 30);
  if (!ready) {
    log("znco", "Next.js failed to start", colors.red);
    return false;
  }

  log("znco", "✓ Next.js ready → http://localhost:3000", colors.green);
  return true;
}

async function startPythonWorker(): Promise<boolean> {
  const portAvailable = await checkPortAvailable(8001);
  if (!portAvailable) {
    log("znco", "Port 8001 is already in use", colors.red);
    return false;
  }

  const proc = spawnProcess({
    name: "Python",
    command: "uv",
    args: ["run", "python", "ai-worker/main.py"],
    cwd: projectRoot,
    env: {},
  });

  managedProcesses.set("python", {
    name: "Python Worker",
    process: proc,
    owned: true,
  });

  const ready = await waitForService("127.0.0.1", 8001, "/health", 15);
  if (!ready) {
    log("znco", "Python Worker failed to start", colors.red);
    return false;
  }

  log("znco", "✓ Python Worker ready → http://127.0.0.1:8001", colors.green);
  return true;
}

async function handleOllama(): Promise<boolean> {
  const isRunning = await checkOllamaRunning();

  if (isRunning) {
    log(
      "znco",
      "✓ Ollama already running → http://localhost:11434",
      colors.green
    );
    managedProcesses.set("ollama", {
      name: "Ollama",
      process: null,
      owned: false,
    });
    return true;
  }

  const portAvailable = await checkPortAvailable(11434);
  if (!portAvailable) {
    log(
      "znco",
      "Port 11434 is occupied by another process (not Ollama)",
      colors.red
    );
    return false;
  }

  log("znco", "Ollama not running. To start Ollama, run in another terminal:");
  log("znco", "  ollama serve", colors.dim);
  log(
    "znco",
    "Proceeding without Ollama (chat will not work)...",
    colors.yellow
  );

  managedProcesses.set("ollama", {
    name: "Ollama",
    process: null,
    owned: false,
  });

  return true;
}

async function cleanupCache() {
  log("znco", "Cleaning development cache...");

  let cleaned = 0;
  let failed = 0;

  for (const cachePath of CACHE_PATHS) {
    const fullPath = join(projectRoot, cachePath);
    if (existsSync(fullPath)) {
      try {
        rmSync(fullPath, { recursive: true, force: true });
        log("znco", `✓ Removed ${cachePath}`);
        cleaned++;
      } catch (err) {
        log(
          "znco",
          `⚠ Could not remove ${cachePath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          colors.yellow
        );
        failed++;
      }
    }
  }

  if (cleaned === 0 && failed === 0) {
    log("znco", "No development cache found.");
  } else if (failed === 0) {
    log(
      "znco",
      `✓ Cache cleanup completed (${cleaned} items removed)`,
      colors.green
    );
  } else {
    log(
      "znco",
      `Cache cleanup partially completed (${cleaned} removed, ${failed} failed)`,
      colors.yellow
    );
  }
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log();
  log("znco", "Shutting down...");

  // Terminate owned processes
  for (const [, { process: proc, owned, name }] of managedProcesses) {
    if (proc && owned) {
      log("znco", `Stopping ${name}...`);
      proc.kill("SIGTERM");
    }
  }

  // Wait for processes to terminate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Force kill if still running
  for (const [, { process: proc, owned }] of managedProcesses) {
    if (proc && owned && !proc.killed) {
      proc.kill("SIGKILL");
    }
  }

  // Cleanup cache
  await cleanupCache();

  log("znco", "Shutdown complete.", colors.green);
  process.exit(0);
}

async function main() {
  banner();

  // Handle graceful shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log("znco", "Starting services...");
  console.log();

  try {
    // Handle Ollama
    const ollamaOk = await handleOllama();
    if (!ollamaOk) {
      log("znco", "Failed to verify Ollama status", colors.red);
      process.exit(1);
    }

    // Start Python Worker first (Next.js may call it)
    const pythonOk = await startPythonWorker();
    if (!pythonOk) {
      log("znco", "Failed to start Python Worker", colors.red);
      await shutdown();
      process.exit(1);
    }

    // Start Next.js
    const nextOk = await startNextJs();
    if (!nextOk) {
      log("znco", "Failed to start Next.js", colors.red);
      await shutdown();
      process.exit(1);
    }

    console.log();
    log("znco", "✓ All services started", colors.green);
    log("znco", "Press Ctrl+C to shutdown");
  } catch (err) {
    log(
      "znco",
      `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
      colors.red
    );
    await shutdown();
    process.exit(1);
  }
}

main();

