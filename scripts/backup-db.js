#!/usr/bin/env node
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";

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
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${milliseconds}-${randomBytes(3).toString("hex")}`;
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function protectAndRotateBackup(sqlPath, env, details = {}) {
  const secret = String(env.CHENDOC_BACKUP_ENCRYPTION_KEY || "");
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("CHENDOC_BACKUP_ENCRYPTION_KEY must be at least 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const target = `${sqlPath}.gz.enc`;
  try {
    writeFileSync(target, Buffer.concat([Buffer.from("CDBK1"), iv]));
    await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), cipher, createWriteStream(target, { flags: "a" }));
    appendFileSync(target, cipher.getAuthTag());
  } catch (error) {
    if (existsSync(target)) rmSync(target);
    throw error;
  }
  rmSync(sqlPath);
  const size = statSync(target).size;
  const metadata = {
    version: 1,
    provider: "mysql",
    createdAt: new Date().toISOString(),
    fileName: target.split(/[\\/]/).pop(),
    size,
    sha256: await fileSha256(target),
    ...details
  };
  writeFileSync(`${target}.json`, `${JSON.stringify(metadata, null, 2)}\n`);

  const backupDir = dirname(target);
  const retentionMs = Number(env.CHENDOC_BACKUP_RETENTION_DAYS || 30) * 86_400_000;
  for (const name of readdirSync(backupDir)) {
    const path = resolve(backupDir, name);
    if ((name.endsWith(".gz.enc") || name.endsWith(".gz.enc.json")) && Date.now() - statSync(path).mtimeMs > retentionMs) rmSync(path);
  }
  if (env.CHENDOC_BACKUP_OFFSITE_DIR) {
    const offsite = resolve(env.CHENDOC_BACKUP_OFFSITE_DIR);
    mkdirSync(offsite, { recursive: true });
    copyFileSync(target, resolve(offsite, target.split(/[\\/]/).pop()));
    copyFileSync(`${target}.json`, resolve(offsite, `${target.split(/[\\/]/).pop()}.json`));
  }
  return target;
}

async function mysqlBackup(env) {
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
    "--no-tablespaces",
    "--routines",
    "--triggers",
    "--default-character-set=utf8mb4",
    "--host", url.hostname,
    "--port", url.port || "3306",
    "--user", decodeURIComponent(url.username),
    "--result-file", out,
    database
  ];

  let protectedPath;
  try {
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
    const sourceConnection = await mysql.createConnection(databaseUrl);
    let sourceTables;
    try {
      const [tableRows] = await sourceConnection.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
      );
      sourceTables = tableRows.map((row) => String(row.TABLE_NAME ?? row.table_name));
    } finally {
      await sourceConnection.end();
    }
    if (!sourceTables.length) throw new Error("MySQL source database contains no tables after dump.");
    protectedPath = await protectAndRotateBackup(out, env, { tables: sourceTables });
  } finally {
    if (existsSync(out)) rmSync(out);
  }
  const markerDir = resolve(root, "backups");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(resolve(markerDir, ".latest-db-backup"), `${protectedPath}\n`);
  console.log(`MySQL encrypted backup completed: ${protectedPath}`);
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
  if (provider === "mysql") await mysqlBackup(env);
  else if (provider === "sqlite") sqliteBackup();
  else throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
