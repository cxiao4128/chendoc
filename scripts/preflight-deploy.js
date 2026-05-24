#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const weakValues = new Set([
  "please_change_this",
  "please_change_this_32_bytes_key",
  "1314520x",
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

function resolveFromRoot(path) {
  return isAbsolute(path) ? path : resolve(root, path);
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
  if (value.length < 12) {
    fail("DEFAULT_ADMIN_PASSWORD must be at least 12 characters.");
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    fail("DEFAULT_ADMIN_PASSWORD must include uppercase, lowercase, and number characters.");
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

function recentBackups(backupDir) {
  if (!existsSync(backupDir)) return [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return readdirSync(backupDir)
    .map((name) => join(backupDir, name))
    .filter((path) => {
      if (!/\.(sqlite|sqlite3|db)$/i.test(path)) return false;
      return statSync(path).mtimeMs >= cutoff;
    });
}

const env = {
  ...readEnvFile(resolve(root, ".env")),
  ...readEnvFile(resolve(root, "server/.env")),
  ...process.env
};

const major = Number(process.versions.node.split(".")[0]);
if (Number.isFinite(major) && major >= 20) {
  note(`Node.js ${process.version}`);
} else {
  fail(`Node.js 20+ is required. Current version: ${process.version}`);
}

checkSecret(env, "JWT_SECRET", 32);
checkSecret(env, "CONFIG_ENCRYPTION_KEY", 32);
checkSecret(env, "RSA_PRIVATE_KEY_ENCRYPTION_KEY", 32);
checkAdminPassword(env);
requireValue(env, "PUBLIC_SITE_URL");

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

const databaseProvider = String(env.DATABASE_PROVIDER || "sqlite").trim().toLowerCase();
if (databaseProvider === "mysql") {
  if (!String(env.DATABASE_URL || "").startsWith("mysql://")) {
    fail("DATABASE_URL must be a mysql:// URL when DATABASE_PROVIDER=mysql.");
  } else {
    note("MySQL database provider selected.");
  }
} else {
  const rawDatabasePath = String(env.DATABASE_URL || "./data/chendoc.sqlite").replace(/^file:/, "");
  const databasePath = resolveFromRoot(rawDatabasePath);
  if (existsSync(databasePath)) {
    const backupDir = resolve(root, "data/backups");
    const backups = recentBackups(backupDir);
    note(`SQLite database found: ${databasePath}`);
    if (existsSync(`${databasePath}-wal`)) {
      warn("SQLite WAL sidecar detected. Do not back up by copying only the main .sqlite file.");
    }
    if (backups.length === 0) {
      warn("No SQLite backup found in data/backups from the last 24 hours. Run: npm run db:backup");
    } else {
      note(`Recent SQLite backup found: ${backups[0]}`);
    }
  } else {
    note(`SQLite database not found yet: ${databasePath}`);
  }
}

console.log("ChenDoc deploy preflight");
for (const message of notes) console.log(`[OK] ${message}`);
for (const message of warnings) console.warn(`[WARN] ${message}`);
for (const message of failures) console.error(`[FAIL] ${message}`);

if (failures.length > 0) {
  process.exit(1);
}
