import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const dbPath = isAbsolute(env.databaseUrl)
  ? env.databaseUrl
  : resolve(env.paths.projectRoot, env.databaseUrl);

mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("wal_autocheckpoint = 1000");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
