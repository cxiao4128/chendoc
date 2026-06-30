import { eq, and, lt, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { jwtKeys } from "../../db/schema.js";
import { now } from "../../utils/date.js";

type JwtKeyRecord = typeof jwtKeys.$inferSelect;

function generateKeyId(): string {
  return `k-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

function generateSecret(): string {
  return randomBytes(48).toString("base64");
}

export async function initializeJwtKeys(): Promise<{ keyId: string; secret: string }> {
  const active = await dbGet<JwtKeyRecord>(
    db.select().from(jwtKeys).where(eq(jwtKeys.isActive, true)).limit(1)
  );
  if (active) {
    return { keyId: active.keyId, secret: active.secret };
  }
  const keyId = generateKeyId();
  const secret = generateSecret();
  await dbRun(db.insert(jwtKeys).values({
    keyId,
    secret,
    isActive: true,
    createdAt: now()
  }));
  return { keyId, secret };
}

export async function getActiveJwtKey(): Promise<{ keyId: string; secret: string } | null> {
  const key = await dbGet<JwtKeyRecord>(
    db.select().from(jwtKeys).where(eq(jwtKeys.isActive, true)).limit(1)
  );
  if (!key) return null;
  return { keyId: key.keyId, secret: key.secret };
}

export async function getAllJwtKeys(): Promise<JwtKeyRecord[]> {
  const keys = await dbAll<JwtKeyRecord>(
    db.select().from(jwtKeys).orderBy(jwtKeys.createdAt)
  );
  return keys;
}

export async function getValidJwtKeys(): Promise<{ keyId: string; secret: string }[]> {
  const keys = await dbAll<JwtKeyRecord>(
    db.select().from(jwtKeys)
  );
  return keys.map((k) => ({ keyId: k.keyId, secret: k.secret }));
}

export async function rotateJwtKey(): Promise<{ newKeyId: string; newSecret: string }> {
  const existing = await dbGet<JwtKeyRecord>(
    db.select().from(jwtKeys).where(eq(jwtKeys.isActive, true)).limit(1)
  );
  if (existing) {
    await dbRun(
      db.update(jwtKeys)
        .set({ isActive: false })
        .where(and(eq(jwtKeys.id, existing.id), eq(jwtKeys.isActive, true)))
    );
  }
  const newKeyId = generateKeyId();
  const newSecret = generateSecret();
  await dbRun(db.insert(jwtKeys).values({
    keyId: newKeyId,
    secret: newSecret,
    isActive: true,
    createdAt: now()
  }));
  return { newKeyId, newSecret };
}

export async function cleanupOldJwtKeys(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await dbRun(
    db.delete(jwtKeys).where(
      and(
        eq(jwtKeys.isActive, false),
        lt(jwtKeys.createdAt, cutoff)
      )
    )
  );
  return result.changes ?? 0;
}
