#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    env[match[1]] = value;
  }
  return env;
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function mysqlBackup(env) {
  const databaseUrl = env.DATABASE_URL || "";
  if (!databaseUrl.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must be mysql:// for MySQL backup.");
  }

  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\/+/, "");
  if (!database) throw new Error("DATABASE_URL must include a database name.");

  const backupDir = resolve(root, env.CHENDOC_BACKUP_DIR || "backups/db");
  mkdirSync(backupDir, { recursive: true });
  const out = resolve(backupDir, `chendoc-mysql-${timestamp()}.sql`);

  const args = [
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    "--default-character-set=utf8mb4",
    "--host", url.hostname,
    "--port", url.port || "3306",
    "--user", decodeURIComponent(url.username),
    "--result-file", out,
    database
  ];

  const result = spawnSync("mysqldump", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      MYSQL_PWD: decodeURIComponent(url.password)
    }
  });

  if (result.error) {
    throw new Error(`mysqldump failed: ${result.error.message}. Install MySQL client tools before deployment.`);
  }
  if (result.status !== 0) {
    throw new Error(`mysqldump exited with status ${result.status}.`);
  }
  console.log(`MySQL backup completed: ${out}`);
}

function sqliteBackup() {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/backup-sqlite.js")], {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`SQLite backup failed with status ${result.status}.`);
}

const env = {
  ...readEnvFile(resolve(root, "server/.env")),
  ...readEnvFile(resolve(root, ".env")),
  ...process.env
};

try {
  const provider = String(env.DATABASE_PROVIDER || "mysql").trim().toLowerCase();
  if (provider === "mysql") mysqlBackup(env);
  else if (provider === "sqlite") sqliteBackup();
  else throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
