import { createPublicKey, generateKeyPair, randomUUID } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { cryptoKeys } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { decryptRsaOaepBase64 } from "../../utils/rsa.js";

const minimumRsaModulusLength = 4096;
const KEY_ROTATE_MS = 20 * 60 * 1000;
const KEY_RETENTION_MS = 45 * 60 * 1000;
const PUBLIC_KEY_CACHE_SKEW_MS = 60 * 1000;

type ActivePublicKey = {
  keyId: string;
  publicKey: string;
  expireAt: Date;
};

let activePublicKeyCache: ActivePublicKey | null = null;
const privateKeyCache = new Map<string, { privateKey: string; expireAt: number }>();

function publicKeyCacheUsable(key: ActivePublicKey | null) {
  return !!key && key.expireAt.getTime() - Date.now() > PUBLIC_KEY_CACHE_SKEW_MS;
}

function cacheActivePublicKey(key: ActivePublicKey) {
  activePublicKeyCache = key;
  return key;
}

function rsaModulusLength(publicKeyPem: string) {
  try {
    return createPublicKey(publicKeyPem).asymmetricKeyDetails?.modulusLength ?? 0;
  } catch {
    return 0;
  }
}

function canReadStoredPrivateKey(privateKeyEncrypted: string) {
  try {
    decryptValue(privateKeyEncrypted, env.rsaPrivateKeyEncryptionKey);
    return true;
  } catch {
    return false;
  }
}

async function createAndStorePublicKey() {
  const { publicKey, privateKey } = await new Promise<{ publicKey: string; privateKey: string }>((resolve, reject) => {
    generateKeyPair("rsa", {
      modulusLength: minimumRsaModulusLength,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    }, (error, nextPublicKey, nextPrivateKey) => {
      if (error) reject(error);
      else resolve({ publicKey: nextPublicKey, privateKey: nextPrivateKey });
    });
  });

  const keyId = randomUUID();
  const createdAt = now();
  await dbRun(db.update(cryptoKeys).set({ status: "retired" }).where(eq(cryptoKeys.status, "active")));
  await dbRun(db.insert(cryptoKeys).values({
    keyId,
    publicKey,
    privateKeyEncrypted: encryptValue(privateKey, env.rsaPrivateKeyEncryptionKey),
    status: "active",
    expireAt: new Date(Date.now() + KEY_RETENTION_MS),
    createdAt
  }));

  privateKeyCache.set(keyId, { privateKey, expireAt: createdAt.getTime() + KEY_RETENTION_MS });

  return cacheActivePublicKey({ keyId, publicKey, expireAt: new Date(createdAt.getTime() + KEY_ROTATE_MS) });
}

export async function getActivePublicKey() {
  if (publicKeyCacheUsable(activePublicKeyCache)) return activePublicKeyCache!;
  activePublicKeyCache = null;

  await cleanupExpiredCryptoKeys();
  const activeKeys = await db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.status, "active"), gt(cryptoKeys.expireAt, now())))
    .orderBy(desc(cryptoKeys.createdAt))
    .limit(10);

  for (const current of activeKeys) {
    const publicExpireAt = new Date(current.createdAt.getTime() + KEY_ROTATE_MS);
    if (publicExpireAt.getTime() <= Date.now()) {
      activePublicKeyCache = null;
      await dbRun(db.update(cryptoKeys).set({ status: "retired" }).where(eq(cryptoKeys.keyId, current.keyId)));
      continue;
    }
    if (rsaModulusLength(current.publicKey) >= minimumRsaModulusLength && canReadStoredPrivateKey(current.privateKeyEncrypted)) {
      return cacheActivePublicKey({ keyId: current.keyId, publicKey: current.publicKey, expireAt: publicExpireAt });
    }

    activePublicKeyCache = null;
    await dbRun(db.update(cryptoKeys).set({ status: "retired" }).where(eq(cryptoKeys.keyId, current.keyId)));
  }

  return await createAndStorePublicKey();
}

export async function cleanupExpiredCryptoKeys() {
  await dbRun(db.delete(cryptoKeys).where(lt(cryptoKeys.expireAt, now())));
  const nowMs = Date.now();
  for (const [keyId, cached] of privateKeyCache) {
    if (cached.expireAt <= nowMs) privateKeyCache.delete(keyId);
  }
}

function privateKeyForRecord(record: typeof cryptoKeys.$inferSelect) {
  const cached = privateKeyCache.get(record.keyId);
  if (cached && cached.expireAt > Date.now()) return cached.privateKey;
  const privateKey = decryptValue(record.privateKeyEncrypted, env.rsaPrivateKeyEncryptionKey);
  if (privateKeyCache.size >= 16) privateKeyCache.delete(privateKeyCache.keys().next().value!);
  privateKeyCache.set(record.keyId, { privateKey, expireAt: record.expireAt.getTime() });
  return privateKey;
}

export async function decryptSubmittedValue(keyId: string, encryptedValue: string) {
  const record = await dbGet<typeof cryptoKeys.$inferSelect>(db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.keyId, keyId), gt(cryptoKeys.expireAt, now())))
    .limit(1));

  if (!record) {
    throw new Error("加密密钥已失效，请刷新页面重试");
  }

  const privateKey = privateKeyForRecord(record);
  return decryptRsaOaepBase64(privateKey, encryptedValue);
}

export async function decryptSubmittedValueWithActiveKey(encryptedValue: string) {
  const records = await db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.status, "active"), gt(cryptoKeys.expireAt, now())))
    .orderBy(desc(cryptoKeys.createdAt));

  for (const record of records) {
    try {
      const privateKey = privateKeyForRecord(record);
      return decryptRsaOaepBase64(privateKey, encryptedValue);
    } catch {
      // Try the next active key. The gateway keeps key identifiers inside the encrypted packet.
    }
  }

  throw new Error("Gateway key decrypt failed.");
}
