import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../db/migrate.js";
import { saveR2Config } from "../modules/settings/settings.service.js";

const defaultPath = "D:\\desktop\\bixu\\js\\r2对象存储文件.txt";
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : defaultPath;

function readEnvLike(content: string, names: string[]) {
  for (const name of names) {
    const phpPattern = new RegExp(`\\$_ENV\\[['"]${name}['"]\\]\\s*=\\s*['"]([^'"]*)['"]`, "i");
    const envPattern = new RegExp(`^\\s*${name}\\s*=\\s*['"]?([^'"\\r\\n]*)['"]?\\s*$`, "im");
    const php = content.match(phpPattern)?.[1];
    const env = content.match(envPattern)?.[1];
    if (php || env) return (php ?? env ?? "").trim();
  }
  return "";
}

function main() {
  const content = readFileSync(sourcePath, "utf8");
  const accountId = readEnvLike(content, ["R2_ACCOUNT_ID"]);
  const bucket = readEnvLike(content, ["R2_BUCKET", "R2_BUCKET_NAME"]);
  const accessKeyId = readEnvLike(content, ["R2_ACCESS_KEY_ID", "R2_ACCESS_KEY"]);
  const secretAccessKey = readEnvLike(content, ["R2_SECRET_ACCESS_KEY", "R2_SECRET_KEY"]);
  const publicUrl = readEnvLike(content, ["R2_PUBLIC_URL", "R2_PUBLIC_DOMAIN"]);
  const endpoint = readEnvLike(content, ["R2_ENDPOINT"]) || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const region = readEnvLike(content, ["R2_REGION"]) || "auto";

  saveR2Config({
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl,
    endpoint,
    region
  });

  console.log("R2 config imported. Sensitive fields were encrypted in the database.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "R2 import failed.");
  process.exit(1);
}
