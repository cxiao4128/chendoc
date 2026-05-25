import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, "../..");
const projectRoot = resolve(serverDir, "..");

for (const envPath of [
  resolve(projectRoot, ".env"),
  resolve(serverDir, ".env"),
  resolve(process.cwd(), ".env")
]) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const weakSecretValues = new Set([
  "please_change_this",
  "please_change_this_32_bytes_key"
]);

const weakAdminPasswordValues = new Set([
  "12345678",
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

  if (allowWeakAdminPassword()) {
    if (usernamePart && normalized.includes(usernamePart)) {
      throw new Error(`${name} must not contain DEFAULT_ADMIN_USERNAME.`);
    }
    return value;
  }

  if (weakAdminPasswordValues.has(normalized) || normalized.startsWith("please_change_this")) {
    throw new Error(`${name} must be changed before initializing the admin account.`);
  }
  if (value.length < 12) {
    throw new Error(`${name} must be at least 12 characters.`);
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error(`${name} must include uppercase, lowercase, number, and symbol characters.`);
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

function databaseProvider(): "sqlite" | "mysql" {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const raw = (process.env.DATABASE_PROVIDER ?? (nodeEnv === "test" ? "sqlite" : "mysql")).trim().toLowerCase();
  if (raw === "mysql") return raw;
  if (raw === "sqlite" && nodeEnv === "test") return raw;
  if (raw === "sqlite") {
    throw new Error("SQLite is kept only for tests and historical migration scripts. Set DATABASE_PROVIDER=mysql for runtime.");
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
  jwtSecret: requiredSecret("JWT_SECRET", 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "2h",
  configEncryptionKey: requiredSecret("CONFIG_ENCRYPTION_KEY", 32),
  rsaPrivateKeyEncryptionKey: requiredSecret("RSA_PRIVATE_KEY_ENCRYPTION_KEY", 32),
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
  }
};
