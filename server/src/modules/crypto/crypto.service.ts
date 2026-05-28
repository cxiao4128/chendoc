import { createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { cryptoKeys } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { daysFromNow, now } from "../../utils/date.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { decryptRsaOaepBase64 } from "../../utils/rsa.js";

const minimumRsaModulusLength = 4096;

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

export async function decryptSubmittedValueWithActiveKey(encryptedValue: string) {
  const records = await db
    .select()
    .from(cryptoKeys)
    .where(and(eq(cryptoKeys.status, "active"), gt(cryptoKeys.expireAt, now())))
    .orderBy(desc(cryptoKeys.createdAt));

  for (const record of records) {
    try {
      const privateKey = decryptValue(record.privateKeyEncrypted, env.rsaPrivateKeyEncryptionKey);
      return decryptRsaOaepBase64(privateKey, encryptedValue);
    } catch {
      // Try the next active key. The gateway keeps key identifiers inside the encrypted packet.
    }
  }

  throw new Error("Gateway key decrypt failed.");
}
