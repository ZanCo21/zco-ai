#!/usr/bin/env node

/**
 * Integration test for RAG pipeline
 * Tests: Knowledge CRUD, Retrieval, Chat flow
 */

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000/api";
const WORKER_URL = "http://127.0.0.1:8001";

let testsPassed = 0;
let testsFailed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    testsFailed++;
  }
}

async function checkWorkerHealth() {
  try {
    const res = await fetch(`${WORKER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=== Integration Tests ===\n");

  // Check worker health
  console.log("Checking Python worker...");
  const workerReady = await checkWorkerHealth();
  if (!workerReady) {
    console.log("Python worker not ready. Skipping tests.");
    console.log("\nTo run tests:");
    console.log("1. Start Python worker: uv run python ai-worker/main.py");
    console.log("2. Start Next.js: pnpm dev");
    console.log("3. Run this test: npx ts-node scripts/integration-test.ts");
    process.exit(1);
  }
  console.log("✓ Python worker ready\n");

  // Test 1: Create knowledge
  await test("POST /api/knowledge - create text knowledge", async () => {
    const res = await fetch(`${BASE_URL}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Beasiswa Test",
        content: "Beasiswa untuk mahasiswa dengan IPK minimal 3.5",
      }),
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.id) throw new Error("No id returned");
  });

  // Test 2: Get knowledge list
  await test("GET /api/knowledge - list all knowledge", async () => {
    const res = await fetch(`${BASE_URL}/knowledge`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error("Not array");
  });

  // Test 3: Retrieval with relevant query
  await test(
    "POST /api/retrieval - query with vocabulary match",
    async () => {
      const res = await fetch(`${BASE_URL}/retrieval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "berapa IPK minimal beasiswa",
          topK: 3,
        }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (!data.query) throw new Error("No query");
      if (!("relevant" in data)) throw new Error("No relevant field");
    }
  );

  // Test 4: Retrieval with irrelevant query
  await test(
    "POST /api/retrieval - query without vocabulary match",
    async () => {
      const res = await fetch(`${BASE_URL}/retrieval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "xyz unknown qwerty",
          topK: 3,
        }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.relevant !== false) throw new Error("Should be irrelevant");
    }
  );

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(console.error);
