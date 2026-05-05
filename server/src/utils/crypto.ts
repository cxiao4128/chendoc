import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptValue(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptValue(payload: string, secret: string) {
  const [version, ivRaw, tagRaw, cipherRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !cipherRaw) {
    throw new Error("Invalid encrypted value.");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
}
