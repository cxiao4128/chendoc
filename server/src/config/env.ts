import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ENV_DEFAULTS } from "./env-defaults.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, "../..");
const projectRoot = resolve(serverDir, "..");

const isE2ETesting = process.env.CHENDOC_E2E_TESTING === "true";

// E2E 测试模式下跳过 .env 加载，使用 global-setup 传入的环境变量
if (!isE2ETesting) {
  for (const envPath of [
    resolve(projectRoot, ".env"),
    resolve(serverDir, ".env"),
    resolve(process.cwd(), ".env")
  ]) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }
}

const weakSecretValues = new Set([
  "please_change_this",
  "please_change_this_32_bytes_key"
]);

const weakAdminPasswordValues = new Set([
  "password",
  "password123",
  "admin123",
  "changeme",
  "please_change_this",
  "please_change_this_admin_password"
]);

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required. Copy .env.example to .env and set a strong value.`);
  }
  return value;
}

function requiredSecret(name: string, minBytes: number): string {
  const value = required(name);
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  if (isProduction) {
    if (weakSecretValues.has(value) || value.startsWith("please_change_this")) {
      throw new Error(`${name} must be changed before production startup.`);
    }
    if (Buffer.byteLength(value, "utf8") < minBytes) {
      throw new Error(`${name} must be at least ${minBytes} bytes in production.`);
    }
  }
  return value;
}

function flagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function allowWeakAdminPassword(): boolean {
  return flagEnabled("CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD") || flagEnabled("CHENDOC_ALLOW_LEGACY_ADMIN_PASSWORD");
}

function optionalAdminPassword(name: string, username: string): string | undefined {
  const raw = process.env[name]?.trim();
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const requiredForInit =
    flagEnabled("CHENDOC_INIT_ADMIN") ||
    flagEnabled("CHENDOC_RESET_ADMIN_PASSWORD") ||
    flagEnabled("CHENDOC_FORCE_ADMIN_RESET");

  if (!raw) {
    if (isProduction || requiredForInit) {
      throw new Error(`${name} is required. Copy .env.example to .env and set a strong value.`);
    }
    return undefined;
  }

  const value = raw;
  const normalized = value.toLowerCase();
  const usernamePart = username.trim().toLowerCase();

  if (weakAdminPasswordValues.has(normalized) || normalized.startsWith("please_change_this")) {
    throw new Error(`${name} must be changed before initializing the admin account.`);
  }
  if (!allowWeakAdminPassword() && value.length < 12) {
    throw new Error(`${name} must be at least 12 characters.`);
  }
  if (usernamePart && normalized.includes(usernamePart)) {
    throw new Error(`${name} must not contain DEFAULT_ADMIN_USERNAME.`);
  }

  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function mysqlPoolSettings() {
  const connectionLimit = optionalPositiveInt("MYSQL_CONNECTION_LIMIT", 10);
  const configuredMaxIdle = optionalPositiveInt("MYSQL_MAX_IDLE", 5);
  return {
    connectionLimit,
    maxIdle: Math.min(configuredMaxIdle, connectionLimit)
  };
}

function databaseProvider(): "sqlite" | "mysql" {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const raw = (process.env.DATABASE_PROVIDER ?? (nodeEnv === "test" ? "sqlite" : "mysql")).trim().toLowerCase();
  if (raw === "mysql") return raw;
  if (raw === "sqlite" && nodeEnv === "test") return raw;
  if (raw === "sqlite" && (nodeEnv !== "production" || flagEnabled("CHENDOC_ALLOW_SQLITE_RUNTIME"))) return raw;
  if (raw === "sqlite") {
    throw new Error("SQLite runtime is disabled in production. Set DATABASE_PROVIDER=mysql, or set CHENDOC_ALLOW_SQLITE_RUNTIME=true for an explicit local override.");
  }
  throw new Error("DATABASE_PROVIDER must be sqlite or mysql.");
}

function databaseUrl(provider: "sqlite" | "mysql") {
  const value = process.env.DATABASE_URL?.trim();
  if (provider === "mysql") {
    if (!value) throw new Error("DATABASE_URL is required and must be a mysql:// URL.");
    if (!/^mysql:\/\//i.test(value)) throw new Error("DATABASE_URL must be a mysql:// URL when DATABASE_PROVIDER=mysql.");
    return value;
  }
  return value || "./data/chendoc.sqlite";
}

function trustProxySetting(): boolean | string[] {
  const raw = (process.env.CHENDOC_TRUST_PROXY ?? process.env.TRUST_PROXY ?? "").trim();
  if (!raw) return ["127.0.0.1", "::1"];
  if (raw === "0" || raw.toLowerCase() === "false" || raw.toLowerCase() === "no") return false;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function remoteAssetAllowedHosts() {
  const raw = (process.env.CHENDOC_REMOTE_ASSET_HOSTS ?? process.env.REMOTE_ASSET_ALLOWED_HOSTS ?? "").trim();
  return raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME ?? "xchen";
const provider = databaseProvider();

export const env = {
  paths: {
    serverDir,
    projectRoot
  },
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: optionalInt("PORT", 8985),
  publicSiteUrl: process.env.PUBLIC_SITE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8985}`,
  databaseProvider: provider,
  databaseUrl: databaseUrl(provider),
  mysqlPool: mysqlPoolSettings(),
  trustProxy: trustProxySetting(),
  jwtSecret: requiredSecret("JWT_SECRET", 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "2h",
  // IDLE_TIMEOUT_MS: 会话 idle 超时时间（毫秒），默认 4 小时，确保正常使用时不会频繁失效
  idleTimeoutMs: optionalInt("IDLE_TIMEOUT_MS", ENV_DEFAULTS.IDLE_TIMEOUT_MS),
  configEncryptionKey: requiredSecret("CONFIG_ENCRYPTION_KEY", 32),
  rsaPrivateKeyEncryptionKey: requiredSecret("RSA_PRIVATE_KEY_ENCRYPTION_KEY", 32),
  documentEncryptionKey: requiredSecret("CHENDOC_DOCUMENT_ENCRYPTION_KEY", 32),
  documentKeyVersion: process.env.CHENDOC_DOCUMENT_KEY_VERSION?.trim() || "v1",
  documentKeyring: process.env.CHENDOC_DOCUMENT_KEYRING?.trim() || "",
  forceHttps: flagEnabled("CHENDOC_FORCE_HTTPS"),
  cspConnectSources: (process.env.CHENDOC_CSP_CONNECT_SRC ?? "https://*.r2.cloudflarestorage.com")
    .split(",").map((item) => item.trim()).filter(Boolean),
  uploadScanWebhook: process.env.CHENDOC_UPLOAD_SCAN_WEBHOOK?.trim() || "",
  requireUploadScan: process.env.CHENDOC_REQUIRE_UPLOAD_SCAN === undefined
    ? (process.env.NODE_ENV ?? "development") === "production"
    : flagEnabled("CHENDOC_REQUIRE_UPLOAD_SCAN"),
  uploadOrphanRetentionHours: optionalPositiveInt("CHENDOC_UPLOAD_ORPHAN_RETENTION_HOURS", 1),
  uploadQuota: {
    dailyFiles: optionalPositiveInt("CHENDOC_UPLOAD_DAILY_FILES", 100),
    dailyBytes: optionalPositiveInt("CHENDOC_UPLOAD_DAILY_MB", 2048) * 1024 * 1024,
    storedBytesPerUser: optionalPositiveInt("CHENDOC_UPLOAD_STORED_MB", 10240) * 1024 * 1024
  },
  trashRetentionDays: optionalPositiveInt("CHENDOC_TRASH_RETENTION_DAYS", 7),
  bodyLimitBytes: optionalPositiveInt("CHENDOC_BODY_LIMIT_MB", 8) * 1024 * 1024,
  logRetentionDays: optionalPositiveInt("CHENDOC_LOG_RETENTION_DAYS", 90),
  failedLogMaxMb: optionalPositiveInt("CHENDOC_FAILED_LOG_MAX_MB", 20),
  defaultAdminUsername,
  defaultAdminPassword: optionalAdminPassword("DEFAULT_ADMIN_PASSWORD", defaultAdminUsername),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
    publicUrl: process.env.R2_PUBLIC_URL ?? "",
    endpoint: process.env.R2_ENDPOINT ?? "",
    region: process.env.R2_REGION ?? "auto"
  },
  uploadLimits: {
    imageMb: optionalInt("MAX_IMAGE_SIZE_MB", 20),
    videoMb: optionalInt("MAX_VIDEO_SIZE_MB", 500),
    fileMb: optionalInt("MAX_FILE_SIZE_MB", 100)
  },
  remoteAssetAllowedHosts: remoteAssetAllowedHosts()
};
