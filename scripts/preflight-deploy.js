#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createDecipheriv, createHash } from "node:crypto";
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

function decryptValue(payload, secret) {
  const [version, ivRaw, tagRaw, cipherRaw] = String(payload).split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !cipherRaw) throw new Error("Invalid encrypted value.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    Buffer.from(ivRaw, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
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

function isReservedExampleHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value.endsWith(".example")
    || value === "example.com"
    || value.endsWith(".example.com")
    || value === "example.net"
    || value.endsWith(".example.net")
    || value === "example.org"
    || value.endsWith(".example.org");
}

function parseOrigins(env, name) {
  const raw = String(env[name] || "").trim();
  if (!raw) return [];
  const origins = [];
  for (const entry of raw.split(",")) {
    const value = entry.trim();
    try {
      const url = new URL(value);
      if (value === "*" || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
        throw new Error();
      }
      if (isReservedExampleHostname(url.hostname)) {
        throw new Error();
      }
      origins.push(url.origin);
    } catch {
      fail(`${name} must contain exact HTTPS origins without paths, never *: ${value || "empty"}.`);
    }
  }
  return [...new Set(origins)];
}

function checkPublicSiteUrl(env) {
  const value = requireValue(env, "PUBLIC_SITE_URL");
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== "/" && url.pathname !== "")
      || isReservedExampleHostname(url.hostname)
    ) {
      throw new Error();
    }
  } catch {
    fail("PUBLIC_SITE_URL must be a real exact HTTPS origin without path, query, hash, credentials, or .example placeholders.");
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
checkPublicSiteUrl(env);
requireValue(env, "CHENDOC_BACKUP_VERIFY_DATABASE_URL");
requireValue(env, "CHENDOC_BACKUP_OFFSITE_DIR");

if (env.CHENDOC_REQUIRE_UPLOAD_SCAN === undefined || flagEnabled(env.CHENDOC_REQUIRE_UPLOAD_SCAN)) {
  requireValue(env, "CHENDOC_UPLOAD_SCAN_WEBHOOK");
}
const r2Fields = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"];
const configuredR2Fields = r2Fields.filter((name) => String(env[name] || "").trim());
const r2Configured = configuredR2Fields.length > 0;
if (r2Configured && configuredR2Fields.length !== r2Fields.length) {
  fail(`R2 configuration is incomplete. Missing: ${r2Fields.filter((name) => !configuredR2Fields.includes(name)).join(", ")}.`);
}
for (const name of ["R2_PUBLIC_URL", "R2_ENDPOINT"]) {
  const value = String(env[name] || "").trim();
  if (!value) continue;
  try {
    if (new URL(value).protocol !== "https:") fail(`${name} must use https://.`);
  } catch {
    fail(`${name} must be a valid URL.`);
  }
}
if (r2Configured && !String(env.R2_BACKUP_BUCKET || "").trim()) {
  if (flagEnabled(env.CHENDOC_REQUIRE_R2_BACKUP)) {
    fail("R2_BACKUP_BUCKET is required when CHENDOC_REQUIRE_R2_BACKUP=true and R2 uploads are configured.");
  } else {
    warn("R2 uploads are configured but object backup is disabled. Database backups do not protect uploaded objects.");
  }
}

if (!flagEnabled(env.CHENDOC_FORCE_HTTPS)) {
  fail("CHENDOC_FORCE_HTTPS=true is required in production.");
}

const adminOrigins = parseOrigins(env, "CHENDOC_ADMIN_ORIGINS");
const r2CorsOrigins = parseOrigins(env, "CHENDOC_R2_CORS_ORIGINS");
const apiOrigins = parseOrigins(env, "CHENDOC_API_ORIGIN");
if (apiOrigins.length > 1) fail("CHENDOC_API_ORIGIN must contain exactly one HTTPS origin.");
if (apiOrigins.length) note(`Public API origin: ${apiOrigins[0]}.`);
if (adminOrigins.length) note(`Split admin origins: ${adminOrigins.join(", ")}.`);
if (String(env.CHENDOC_SERVE_ADMIN || "true").trim().toLowerCase() === "false") {
  if (!adminOrigins.length) fail("CHENDOC_ADMIN_ORIGINS is required when CHENDOC_SERVE_ADMIN=false.");
  if (!apiOrigins.length) fail("CHENDOC_API_ORIGIN is required when CHENDOC_SERVE_ADMIN=false.");
}
if (r2CorsOrigins.length) note(`R2 browser origins: ${r2CorsOrigins.join(", ")}.`);

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
    let connection;
    try {
      const mysql = await import("mysql2/promise");
      connection = await mysql.createConnection(env.DATABASE_URL);
      const [rows] = await connection.query(`
        SELECT DISTINCT key_version FROM (
          SELECT content_json_key_version AS key_version FROM docs WHERE content_json_ciphertext IS NOT NULL
          UNION SELECT content_html_key_version FROM docs WHERE content_html_ciphertext IS NOT NULL
          UNION SELECT content_json_key_version FROM doc_versions WHERE content_json_ciphertext IS NOT NULL
          UNION SELECT content_html_key_version FROM doc_versions WHERE content_html_ciphertext IS NOT NULL
        ) versions WHERE key_version IS NOT NULL
      `);
      for (const row of rows) {
        if (!configuredDocumentVersions.has(String(row.key_version))) {
          fail(`Database uses document key version ${row.key_version}, but no key is configured for it.`);
        }
      }
      const [settingRows] = await connection.query(
        "SELECT `key`, `value`, `encrypted` FROM settings WHERE `key` IN ('r2.account_id','r2.access_key_id','r2.secret_access_key','r2.bucket','r2.public_url','r2.endpoint','r2.region')"
      );
      const databaseR2 = new Map();
      for (const row of settingRows) {
        const value = row.encrypted
          ? decryptValue(row.value, String(env.CONFIG_ENCRYPTION_KEY))
          : String(row.value ?? "");
        databaseR2.set(String(row.key), value);
      }
      const effectiveR2 = {
        accountId: databaseR2.get("r2.account_id") ?? String(env.R2_ACCOUNT_ID || ""),
        accessKeyId: databaseR2.get("r2.access_key_id") ?? String(env.R2_ACCESS_KEY_ID || ""),
        secretAccessKey: databaseR2.get("r2.secret_access_key") ?? String(env.R2_SECRET_ACCESS_KEY || ""),
        bucket: databaseR2.get("r2.bucket") ?? String(env.R2_BUCKET || ""),
        publicUrl: databaseR2.get("r2.public_url") ?? String(env.R2_PUBLIC_URL || "")
      };
      const missingEffectiveR2 = Object.entries(effectiveR2)
        .filter(([, value]) => !String(value).trim())
        .map(([name]) => name);
      if (configuredR2Fields.length > 0 && missingEffectiveR2.length > 0) {
        fail(`Effective R2 configuration is incomplete after database overrides. Missing: ${missingEffectiveR2.join(", ")}.`);
      }
      const [cryptoRows] = await connection.query(
        "SELECT private_key_encrypted FROM crypto_keys WHERE status = 'active' ORDER BY id DESC LIMIT 1"
      );
      if (cryptoRows[0]?.private_key_encrypted) {
        decryptValue(cryptoRows[0].private_key_encrypted, String(env.RSA_PRIVATE_KEY_ENCRYPTION_KEY));
      }
      note("Database encryption keys and effective R2 settings are readable.");
    } catch (error) {
      if (error && typeof error === "object" && ["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) {
        note("Database key/configuration checks deferred until the initial migration.");
      } else {
        fail(`Unable to verify database keys and configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      await connection?.end().catch(() => undefined);
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
