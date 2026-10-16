import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), "data", "app.db");

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch {
  // ignore
}

const sqlite = new Database(dbPath);

// Databases created before `knowledge.metadata` existed: add the nullable
// column in place (same result as `pnpm drizzle-kit push`, no data loss).
try {
  const columns = sqlite.prepare("PRAGMA table_info(knowledge)").all() as Array<{ name: string }>;
  if (columns.length > 0 && !columns.some((c) => c.name === "metadata")) {
    sqlite.exec("ALTER TABLE knowledge ADD COLUMN metadata text");
  }
} catch (error) {
  console.warn("Could not verify knowledge.metadata column:", error);
}

export const db = drizzle(sqlite, { schema });
