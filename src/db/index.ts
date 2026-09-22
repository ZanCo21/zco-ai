import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), "data", "app.db");

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
try {
  require("fs").mkdirSync(dataDir, { recursive: true });
} catch (e) {
  // ignore
}

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
