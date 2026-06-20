#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const weakValues = new Set([
  "please_change_this",
  "please_change_this_32_bytes_key",
  "admin",
  "password",
  "changeme",
  "change_me"
]);

const failures = [];
const warnings = [];
const notes = [];

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
    if (env[match[1]] === undefined) env[match[1]] = value;
  }
  return env;
}

function mergeEnv(target, source, sourceName, sources) {
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    target[name] = value;
    sources[name] = sourceName;
  }
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function note(message) {
  notes.push(message);
}

function isWeak(value) {
  return weakValues.has(value) || value.startsWith("please_change_this");
}

function flagEnabled(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function allowWeakAdminPassword(env) {
  return flagEnabled(env.CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD) || flagEnabled(env.CHENDOC_ALLOW_LEGACY_ADMIN_PASSWORD);
}

function requireValue(env, name) {
  const value = env[name];
  if (!value || !String(value).trim()) {
    fail(`${name} is required.`);
    return "";
  }
  return String(value);
}

function checkSecret(env, name, minBytes) {
  const value = requireValue(env, name);
  if (!value) return;
  if (isWeak(value)) {
    fail(`${name} still uses a known weak/default value.`);
  }
  if (byteLength(value) < minBytes) {
    fail(`${name} must be at least ${minBytes} bytes.`);
  }
}

function checkAdminPassword(env) {
  const value = requireValue(env, "DEFAULT_ADMIN_PASSWORD");
  if (!value) return;
  if (allowWeakAdminPassword(env)) {
    warn("CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD=1 is enabled. Legacy admin password compatibility is active.");
    return;
  }
  if (isWeak(value)) {
    fail("DEFAULT_ADMIN_PASSWORD still uses a known weak/default value.");
  }
  if (!allowWeakAdminPassword(env) && value.length < 12) {
    fail("DEFAULT_ADMIN_PASSWORD must be at least 12 characters.");
  }
}

async function checkPort(port, host) {
  return new Promise((resolveCheck) => {
    const server = net.createServer();
    server.once("error", (error) => {
      resolveCheck({ available: false, code: error.code || "UNKNOWN" });
    });
    server.once("listening", () => {
      server.close(() => resolveCheck({ available: true }));
    });
    server.listen({ port, host, exclusive: true });
  });
}

const env = {};
const envSources = {};
const serverEnv = readEnvFile(resolve(root, "server/.env"));
const rootEnv = readEnvFile(resolve(root, ".env"));

mergeEnv(env, serverEnv, "server/.env", envSources);
mergeEnv(env, rootEnv, ".env", envSources);
mergeEnv(env, process.env, "process.env", envSources);

const major = Number(process.versions.node.split(".")[0]);
if (Number.isFinite(major) && major >= 20) {
  note(`Node.js ${process.version}`);
} else {
  fail(`Node.js 20+ is required. Current version: ${process.version}`);
}

checkSecret(env, "JWT_SECRET", 32);
checkSecret(env, "CONFIG_ENCRYPTION_KEY", 32);
checkSecret(env, "RSA_PRIVATE_KEY_ENCRYPTION_KEY", 32);
checkSecret(env, "CHENDOC_DOCUMENT_ENCRYPTION_KEY", 32);
checkSecret(env, "CHENDOC_BACKUP_ENCRYPTION_KEY", 32);
checkAdminPassword(env);
requireValue(env, "PUBLIC_SITE_URL");

if (!String(env.PUBLIC_SITE_URL || "").startsWith("https://")) {
  fail("PUBLIC_SITE_URL must use https:// in production.");
}
if (!flagEnabled(env.CHENDOC_FORCE_HTTPS)) {
  fail("CHENDOC_FORCE_HTTPS=true is required in production.");
}

function documentKeyVersions(env) {
  const versions = new Set([String(env.CHENDOC_DOCUMENT_KEY_VERSION || "v1")]);
  if (!env.CHENDOC_DOCUMENT_KEYRING) return versions;
  try {
    const keyring = JSON.parse(env.CHENDOC_DOCUMENT_KEYRING);
    for (const [version, secret] of Object.entries(keyring)) {
      if (Buffer.byteLength(String(secret), "utf8") < 32) fail(`Document keyring entry ${version} must be at least 32 bytes.`);
      versions.add(version);
    }
  } catch {
    fail("CHENDOC_DOCUMENT_KEYRING must be a JSON object.");
  }
  return versions;
}

const configuredDocumentVersions = documentKeyVersions(env);

function databaseUrlKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "missing";
  if (normalized.startsWith("mysql://")) return "mysql";
  if (normalized.startsWith("file:") || normalized.startsWith("sqlite:") || normalized.includes(".sqlite")) return "sqlite";
  return "other";
}

if (String(rootEnv.DATABASE_PROVIDER || "").trim().toLowerCase() === "sqlite") {
  fail("Root .env still sets DATABASE_PROVIDER=sqlite. Production deployment must use DATABASE_PROVIDER=mysql.");
}

if (databaseUrlKind(rootEnv.DATABASE_URL) === "sqlite") {
  fail("Root .env still uses a legacy SQLite DATABASE_URL. Set DATABASE_PROVIDER=mysql and DATABASE_URL=mysql://user:password@host:3306/database.");
}

if (serverEnv.DATABASE_PROVIDER || serverEnv.DATABASE_URL) {
  warn("server/.env contains database settings. Runtime deployment reads root .env first; keep production DATABASE_PROVIDER and DATABASE_URL in the project-root .env.");
}

const port = Number(env.PORT || 8985);
const host = env.HOST && env.HOST !== "::" ? env.HOST : "0.0.0.0";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`PORT must be a valid TCP port. Current value: ${env.PORT}`);
} else {
  const portResult = await checkPort(port, host);
  if (portResult.available) {
    note(`Port ${host}:${port} is available.`);
  } else if (env.CHENDOC_PREFLIGHT_STRICT_PORT === "1") {
    fail(`Port ${host}:${port} is already in use (${portResult.code}).`);
  } else {
    warn(`Port ${host}:${port} is already in use (${portResult.code}). Stop the old service or confirm it is the current ChenDoc process.`);
  }
}

const databaseProvider = String(env.DATABASE_PROVIDER || "mysql").trim().toLowerCase();
if (databaseProvider === "mysql") {
  if (!String(env.DATABASE_URL || "").startsWith("mysql://")) {
    fail(`DATABASE_URL must be a mysql:// URL when DATABASE_PROVIDER=mysql. Current source: ${envSources.DATABASE_URL || "missing"}.`);
  } else {
    note(`MySQL database provider selected (${envSources.DATABASE_PROVIDER || "default mysql"}).`);
    try {
      const mysql = await import("mysql2/promise");
      const connection = await mysql.createConnection(env.DATABASE_URL);
      const [rows] = await connection.query(`
        SELECT DISTINCT key_version FROM (
          SELECT content_json_key_version AS key_version FROM docs WHERE content_json_ciphertext IS NOT NULL
          UNION SELECT content_html_key_version FROM docs WHERE content_html_ciphertext IS NOT NULL
          UNION SELECT content_json_key_version FROM doc_versions WHERE content_json_ciphertext IS NOT NULL
          UNION SELECT content_html_key_version FROM doc_versions WHERE content_html_ciphertext IS NOT NULL
        ) versions WHERE key_version IS NOT NULL
      `);
      await connection.end();
      for (const row of rows) {
        if (!configuredDocumentVersions.has(String(row.key_version))) {
          fail(`Database uses document key version ${row.key_version}, but no key is configured for it.`);
        }
      }
    } catch (error) {
      if (error && typeof error === "object" && ["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) {
        note("Document key-version check deferred until the initial migration.");
      } else {
        fail(`Unable to verify document key versions: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
} else {
  fail(`Production deployment requires DATABASE_PROVIDER=mysql. Current source: ${envSources.DATABASE_PROVIDER || "missing"}. SQLite is only kept for historical migration/testing notes.`);
}

console.log("ChenDoc deploy preflight");
for (const message of notes) console.log(`[OK] ${message}`);
for (const message of warnings) console.warn(`[WARN] ${message}`);
for (const message of failures) console.error(`[FAIL] ${message}`);

if (failures.length > 0) {
  process.exit(1);
}
