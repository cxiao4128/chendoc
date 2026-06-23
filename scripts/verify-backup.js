#!/usr/bin/env node
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const rawLine of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    env[match[1]] = value;
  }
  return env;
}

const expectedTables = [
  "users",
  "spaces",
  "invites",
  "captchas",
  "crypto_keys",
  "auth_sessions",
  "docs",
  "shares",
  "forms",
  "form_submissions",
  "uploads",
  "doc_versions",
  "settings",
  "operation_logs",
  "login_failures",
  "danger_verifications",
  "audit_logs",
  "logs"
];

function isVerificationDatabase(database) {
  return /(?:^|[_-])(?:restore|recovery|verify|verification|test)(?:[_-]|$)/i.test(database);
}

function countValueTuples(values, table) {
  let depth = 0;
  let escaped = false;
  let quoted = false;
  let rows = 0n;

  for (const character of values) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") quoted = true;
    else if (character === "(") {
      if (depth === 0) rows += 1n;
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth < 0) throw new Error(`Malformed INSERT data for table ${table}.`);
    }
  }

  if (quoted || depth !== 0 || rows === 0n) throw new Error(`Malformed INSERT data for table ${table}.`);
  return rows;
}

function dumpRowCounts(sql) {
  const counts = new Map(expectedTables.map((table) => [table, 0n]));
  const insertPattern = /^INSERT INTO `([^`]+)`(?: \([^\r\n]+\))? VALUES (.*);\r?$/gm;
  for (const match of sql.matchAll(insertPattern)) {
    if (!counts.has(match[1])) continue;
    counts.set(match[1], counts.get(match[1]) + countValueTuples(match[2], match[1]));
  }
  return counts;
}

const [backupPath] = process.argv.slice(2);
const runtimeEnv = {
  ...readEnvFile(resolve(root, "server/.env")),
  ...readEnvFile(resolve(root, ".env")),
  ...process.env
};
const databaseUrl = runtimeEnv.CHENDOC_BACKUP_VERIFY_DATABASE_URL;
const secret = runtimeEnv.CHENDOC_BACKUP_ENCRYPTION_KEY || "";
if (!backupPath || !databaseUrl) throw new Error("Usage: CHENDOC_BACKUP_VERIFY_DATABASE_URL=mysql://... npm run db:backup:verify -- backup.sql.gz.enc");
if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("CHENDOC_BACKUP_ENCRYPTION_KEY must be at least 32 bytes.");
const url = new URL(databaseUrl);
const database = url.pathname.replace(/^\/+/, "");
if (!isVerificationDatabase(database)) {
  throw new Error("Verification database name must contain a standalone restore/recovery/verify/test marker.");
}
const input = readFileSync(backupPath);
const metadataPath = `${backupPath}.json`;
if (!existsSync(metadataPath)) throw new Error("Backup checksum metadata is missing.");
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
const checksum = createHash("sha256").update(input).digest("hex");
if (metadata.sha256 !== checksum || Number(metadata.size) !== input.byteLength) throw new Error("Backup checksum verification failed.");
if (input.subarray(0, 5).toString() !== "CDBK1") throw new Error("Invalid backup header.");
const iv = input.subarray(5, 17);
const tag = input.subarray(input.length - 16);
const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
decipher.setAuthTag(tag);
const sql = gunzipSync(Buffer.concat([decipher.update(input.subarray(17, -16)), decipher.final()]));
const expectedRowCounts = dumpRowCounts(sql.toString("utf8"));
const resetConnection = await mysql.createConnection(databaseUrl);
try {
  const [existingTables] = await resetConnection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  await resetConnection.query("SET FOREIGN_KEY_CHECKS=0");
  for (const row of existingTables) {
    const table = String(row.TABLE_NAME ?? row.table_name).replace(/`/g, "``");
    await resetConnection.query(`DROP TABLE IF EXISTS \`${table}\``);
  }
  await resetConnection.query("SET FOREIGN_KEY_CHECKS=1");
} finally {
  await resetConnection.end();
}
const imported = spawnSync("mysql", ["--host", url.hostname, "--port", url.port || "3306", "--user", decodeURIComponent(url.username), database], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }
});
if (imported.error) throw new Error(`mysql restore failed: ${imported.error.message}`);
if (imported.status !== 0) throw new Error(`mysql restore exited with ${imported.status}`);
const connection = await mysql.createConnection(databaseUrl);
try {
  const [tableRows] = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  const restoredTables = new Set(tableRows.map((row) => row.TABLE_NAME ?? row.table_name));
  const missingTables = expectedTables.filter((table) => !restoredTables.has(table));
  if (missingTables.length) throw new Error(`Restored database is missing tables: ${missingTables.join(", ")}`);
  const unexpectedTables = [...restoredTables].filter((table) => !expectedTables.includes(table));
  if (unexpectedTables.length) throw new Error(`Restored database has unexpected tables: ${unexpectedTables.join(", ")}`);

  let expectedTotal = 0n;
  let restoredTotal = 0n;
  for (const table of expectedTables) {
    const expectedCount = expectedRowCounts.get(table);
    const [countRows] = await connection.query(`SELECT CAST(COUNT(*) AS CHAR) AS row_count FROM \`${table}\``);
    const restoredCount = BigInt(countRows[0]?.row_count ?? 0);
    expectedTotal += expectedCount;
    restoredTotal += restoredCount;
    if (restoredCount !== expectedCount) {
      throw new Error(`Restored row count mismatch for ${table}: backup=${expectedCount} restored=${restoredCount}`);
    }
  }

  if ((expectedRowCounts.get("users") ?? 0n) === 0n || expectedTotal === 0n) {
    throw new Error("Backup contains no user data.");
  }
  console.log(`Backup restore verification passed: ${expectedTables.length} tables, ${restoredTotal} rows`);
} finally {
  await connection.end();
}
