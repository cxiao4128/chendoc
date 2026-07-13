import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import * as schema from "./schema.js";
import { measureRequestPhase } from "../utils/requestTiming.js";

type RunResult = {
  changes: number;
  lastInsertRowid: number;
};

function sqlitePathFromDatabaseUrl(databaseUrl: string) {
  const value = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  return isAbsolute(value) ? value : resolve(env.paths.projectRoot, value);
}

export const databaseProvider = env.databaseProvider;
const sqliteDatabasePath = databaseProvider === "sqlite" ? sqlitePathFromDatabaseUrl(env.databaseUrl) : null;

if (sqliteDatabasePath) {
  mkdirSync(dirname(sqliteDatabasePath), { recursive: true });
}

export const sqlite = databaseProvider === "sqlite"
  ? new Database(sqliteDatabasePath!)
  : null;

if (sqlite) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("wal_autocheckpoint = 1000");
  sqlite.pragma("foreign_keys = ON");
}

export const mysqlPool = databaseProvider === "mysql"
  ? mysql.createPool({
    uri: env.databaseUrl,
    connectTimeout: 10000,
    connectionLimit: env.mysqlPool.connectionLimit,
    maxIdle: env.mysqlPool.maxIdle,
    idleTimeout: 30000,
    waitForConnections: true,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: "utf8mb4"
  })
  : null;

const rawDb = databaseProvider === "mysql"
  ? drizzleMysql(mysqlPool!, { schema, mode: "default" })
  : drizzleSqlite(sqlite!, { schema });

export const db: any = rawDb;
let sqliteTransactionTail: Promise<void> = Promise.resolve();

export async function dbAll<T = any>(query: any): Promise<T[]> {
  return await measureRequestPhase("db", async () => {
    if (typeof query.all === "function") return query.all() as T[];
    if (typeof query.execute === "function") return await query.execute() as T[];
    return await query as T[];
  });
}

export async function dbGet<T = any>(query: any): Promise<T | undefined> {
  return await measureRequestPhase("db", async () => {
    if (typeof query.get === "function") return query.get() as T | undefined;
    if (typeof query.execute === "function") {
      const rows = await query.execute() as T[];
      return rows[0];
    }
    const rows = await query as T[];
    return rows[0];
  });
}

export async function dbRun(query: any): Promise<RunResult> {
  return await measureRequestPhase("db", async () => {
    if (typeof query.run === "function") {
      const result = query.run();
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowid: Number(result.lastInsertRowid ?? 0)
      };
    }

    const result = typeof query.execute === "function" ? await query.execute() : await query;
    const header = Array.isArray(result) ? result[0] : result;
    return {
      changes: Number(header?.affectedRows ?? header?.changedRows ?? 0),
      lastInsertRowid: Number(header?.insertId ?? 0)
    };
  });
}

export async function dbHealthCheck() {
  return await measureRequestPhase("db", async () => {
    if (databaseProvider === "sqlite") {
      const row = sqlite!.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
      return Number(row?.ok) === 1;
    }

    const [rows] = await mysqlPool!.query("SELECT 1 AS ok");
    const row = (rows as Array<{ ok: number }>)[0];
    return Number(row?.ok) === 1;
  });
}

export async function dbTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
  if (databaseProvider === "sqlite") {
    const previous = sqliteTransactionTail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    sqliteTransactionTail = previous.then(() => current);
    await previous;
    try {
      sqlite!.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(db);
        sqlite!.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite!.exec("ROLLBACK");
        throw error;
      }
    } finally {
      release();
    }
  }

  return await db.transaction(async (tx: any) => callback(tx));
}

export function castAsText(value: unknown) {
  return databaseProvider === "mysql"
    ? sql<string>`CAST(${value} AS CHAR)`
    : sql<string>`CAST(${value} AS TEXT)`;
}

export async function closeDatabase() {
  if (mysqlPool) {
    await mysqlPool.end();
  }
  if (sqlite?.open) {
    sqlite.close();
  }
}
