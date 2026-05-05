#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  const content = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    env[match[1]] = value;
  }
  return env;
}

function resolveFromRoot(path) {
  return isAbsolute(path) ? path : resolve(root, path);
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/backup-sqlite.js [--database path] [--out path]

Creates a consistent SQLite backup using VACUUM INTO.
Defaults:
  --database DATABASE_URL from .env, or ./data/chendoc.sqlite
  --out      ./data/backups/chendoc-YYYYMMDD-HHMMSS.sqlite`);
  process.exit(0);
}

const fileEnv = {
  ...readEnvFile(resolve(root, ".env")),
  ...readEnvFile(resolve(root, "server/.env"))
};
const mergedEnv = { ...fileEnv, ...process.env };

const sourcePath = resolveFromRoot(String(args.database || mergedEnv.DATABASE_URL || "./data/chendoc.sqlite"));
const outputPath = resolveFromRoot(String(args.out || mergedEnv.CHENDOC_BACKUP_PATH || `./data/backups/chendoc-${timestamp()}.sqlite`));
const tempPath = `${outputPath}.tmp-${process.pid}`;

if (!existsSync(sourcePath)) {
  console.error(`SQLite database not found: ${sourcePath}`);
  process.exit(1);
}

if (existsSync(outputPath)) {
  console.error(`Backup target already exists: ${outputPath}`);
  process.exit(1);
}

if (existsSync(tempPath)) {
  console.error(`Temporary backup target already exists: ${tempPath}`);
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });

let sourceDb;
let backupDb;
try {
  sourceDb = new Database(sourcePath, { fileMustExist: true });
  sourceDb.pragma("busy_timeout = 5000");
  sourceDb.exec(`VACUUM INTO ${quoteSqlString(tempPath)}`);
  sourceDb.close();
  sourceDb = undefined;

  backupDb = new Database(tempPath, { readonly: true, fileMustExist: true });
  const integrity = backupDb.prepare("PRAGMA integrity_check").pluck().get();
  backupDb.close();
  backupDb = undefined;

  if (integrity !== "ok") {
    throw new Error(`Backup integrity check failed: ${integrity}`);
  }

  renameSync(tempPath, outputPath);
  const size = statSync(outputPath).size;
  console.log(`SQLite backup completed: ${outputPath} (${formatBytes(size)})`);
} catch (error) {
  if (sourceDb) sourceDb.close();
  if (backupDb) backupDb.close();
  if (existsSync(tempPath)) rmSync(tempPath, { force: true });
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
