/**
 * Retrieval configuration read from environment variables (see .env.example).
 * Single source of truth so routes never hard-code thresholds.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function retrievalConfig() {
  return {
    topK: Math.max(1, Math.trunc(num("TOP_K", 3))),
    threshold: num("SIMILARITY_THRESHOLD", 0.2),
    coverageThreshold: num("COVERAGE_THRESHOLD", 0.5),
    minSimilarity: num("MIN_SIMILARITY", 0.03),
  };
}
