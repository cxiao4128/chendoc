import { createCipheriv, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { cryptoKeys } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { daysFromNow, now } from "../../utils/date.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { decryptRsaOaepBase64, encryptRsaOaepBase64 } from "../../utils/rsa.js";

const minimumRsaModulusLength = 4096;

export interface HybridEncryptedPayload {
  keyId: string;
  key: string;
  payload: string;
}

function deriveIv(key: Buffer, label: string) {
  return createHash("sha256").update("chendoc-aes-iv-v1").update(label).update(key).digest().subarray(0, 12);
}

function encryptAesGcm(key: Buffer, label: string, value: string) {
  const cipher = createCipheriv("aes-256-gcm", key, deriveIv(key, label));
  return Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]).toString("base64");
}

function decryptAesGcm(key: Buffer, label: string, payload: string) {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= 16) {
    throw new Error("Invalid encrypted payload.");
  }

  const ciphertext = raw.subarray(0, -16);
  const tag = raw.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, deriveIv(key, label));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function rsaModulusLength(publicKeyPem: string) {
  try {
    return createPublicKey(publicKeyPem).asymmetricKeyDetails?.modulusLength ?? 0;
  } catch {
    return 0;
  }
}

async function createAndStorePublicKey() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: minimumRsaModulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const keyId = randomUUID();
  await dbRun(db.insert(cryptoKeys).values({
    keyId,
    publicKey,
    privateKeyEncrypted: encryptValue(privateKey, env.rsaPrivateKeyEncryptionKey),
    status: "active",
    expireAt: daysFromNow(7),
    createdAt: now()
  }));

  return { keyId, publicKey };
}

export async function getActivePublicKey() {
  const current = await dbGet<typeof cryptoKeys.$inferSelect>(db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.status, "active"), gt(cryptoKeys.expireAt, now())))
    .orderBy(desc(cryptoKeys.createdAt))
    .limit(1));

  if (current && rsaModulusLength(current.publicKey) >= minimumRsaModulusLength) {
    return { keyId: current.keyId, publicKey: current.publicKey };
  }

  if (current) {
    await dbRun(db.update(cryptoKeys).set({ status: "retired" }).where(eq(cryptoKeys.keyId, current.keyId)));
  }

  return await createAndStorePublicKey();
}

export async function decryptSubmittedValue(keyId: string, encryptedValue: string) {
  const record = await dbGet<typeof cryptoKeys.$inferSelect>(db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.keyId, keyId), eq(cryptoKeys.status, "active"), gt(cryptoKeys.expireAt, now())))
    .limit(1));

  if (!record) {
    throw new Error("加密密钥已失效，请刷新页面重试");
  }

  const privateKey = decryptValue(record.privateKeyEncrypted, env.rsaPrivateKeyEncryptionKey);
  return decryptRsaOaepBase64(privateKey, encryptedValue);
}

export async function decryptSubmittedPayload(input: HybridEncryptedPayload) {
  const aesKeyBase64 = await decryptSubmittedValue(input.keyId, input.key);
  const aesKey = Buffer.from(aesKeyBase64, "base64");
  if (aesKey.length !== 32) {
    throw new Error("Invalid encrypted payload key.");
  }
  return decryptAesGcm(aesKey, "request", input.payload);
}

export function decryptSubmittedPassword(keyId: string, encryptedPassword: string) {
  return decryptSubmittedValue(keyId, encryptedPassword);
}

export function encryptResponse(publicKey: string, payload: unknown) {
  const key = randomBytes(32);
  const envelope = {
    alg: "RSA-OAEP-256+A256GCM",
    key: encryptRsaOaepBase64(publicKey, key.toString("base64")),
    data: encryptAesGcm(key, "response", JSON.stringify(payload))
  };
  return { encryptedData: Buffer.from(JSON.stringify(envelope), "utf8").toString("base64") };
}
