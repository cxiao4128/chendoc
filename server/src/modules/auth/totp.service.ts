import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { now } from "../../utils/date.js";

type UserWithTotp = typeof users.$inferSelect;
type PendingSecret = { secret: string; expireAt: number };
type RecoveryCode = { code: string; usedAt: string | null };

const pendingSecrets = new Map<number, PendingSecret>();
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(input: Buffer) {
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  return bits.match(/.{1,5}/g)?.map((chunk) => BASE32[Number.parseInt(chunk.padEnd(5, "0"), 2)]).join("") ?? "";
}

function base32Decode(input: string) {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [];
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = ((hmac[offset]! & 0x7f) << 24)
    | ((hmac[offset + 1]! & 0xff) << 16)
    | ((hmac[offset + 2]! & 0xff) << 8)
    | (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string, code: string) {
  const clean = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    if (hotp(secret, counter + drift) === clean) return true;
  }
  return false;
}

function recoveryDigest(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function encryptRecoveryCodes(codes: RecoveryCode[]) {
  return encryptValue(JSON.stringify(codes), env.configEncryptionKey);
}

function decryptRecoveryCodes(value?: string | null): RecoveryCode[] {
  if (!value) return [];
  try {
    return JSON.parse(decryptValue(value, env.configEncryptionKey)) as RecoveryCode[];
  } catch {
    return [];
  }
}

function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => `${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`);
}

function otpauthUrl(username: string, secret: string) {
  const issuer = "ChenDoc";
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function publicStatus(user: UserWithTotp) {
  const codes = decryptRecoveryCodes(user.totpRecoveryCodesEncrypted);
  return {
    enabled: !!user.totpEnabled,
    recoveryCodesRemaining: codes.filter((item) => !item.usedAt).length,
    updatedAt: user.totpUpdatedAt
  };
}

export async function getTotpStatus(userId: number) {
  const user = await dbGet<UserWithTotp>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user) throw new Error("User not found.");
  return publicStatus(user);
}

export async function beginTotpSetup(userId: number) {
  const user = await dbGet<UserWithTotp>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user) throw new Error("User not found.");
  const secret = base32Encode(randomBytes(20));
  pendingSecrets.set(userId, { secret, expireAt: Date.now() + 10 * 60 * 1000 });
  return { secret, otpauthUrl: otpauthUrl(user.username, secret), expireAt: Date.now() + 10 * 60 * 1000 };
}

export async function enableTotp(userId: number, otp: string) {
  const pending = pendingSecrets.get(userId);
  if (!pending || pending.expireAt <= Date.now()) throw new Error("TOTP setup expired.");
  if (!verifyTotp(pending.secret, otp)) throw new Error("Invalid OTP.");
  const recoveryCodes = generateRecoveryCodes();
  await dbRun(db.update(users).set({
    totpEnabled: true,
    totpSecretEncrypted: encryptValue(pending.secret, env.configEncryptionKey),
    totpRecoveryCodesEncrypted: encryptRecoveryCodes(recoveryCodes.map((code) => ({ code, usedAt: null }))),
    totpUpdatedAt: now(),
    updatedAt: now()
  }).where(eq(users.id, userId)));
  pendingSecrets.delete(userId);
  return { enabled: true, recoveryCodes };
}

export async function disableTotp(userId: number) {
  await dbRun(db.update(users).set({
    totpEnabled: false,
    totpSecretEncrypted: null,
    totpRecoveryCodesEncrypted: null,
    totpUpdatedAt: now(),
    updatedAt: now()
  }).where(eq(users.id, userId)));
  pendingSecrets.delete(userId);
  return { enabled: false };
}

export async function listRecoveryCodes(userId: number) {
  const user = await dbGet<UserWithTotp>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user) throw new Error("User not found.");
  return decryptRecoveryCodes(user.totpRecoveryCodesEncrypted).filter((item) => !item.usedAt).map((item) => item.code);
}

export async function regenerateRecoveryCodes(userId: number) {
  const recoveryCodes = generateRecoveryCodes();
  await dbRun(db.update(users).set({
    totpRecoveryCodesEncrypted: encryptRecoveryCodes(recoveryCodes.map((code) => ({ code, usedAt: null }))),
    totpUpdatedAt: now(),
    updatedAt: now()
  }).where(eq(users.id, userId)));
  return recoveryCodes;
}

export async function verifyAdminSecondFactor(user: UserWithTotp, otp?: string, recoveryCode?: string) {
  if (!user.totpEnabled) return true;
  const secret = user.totpSecretEncrypted ? decryptValue(user.totpSecretEncrypted, env.configEncryptionKey) : "";
  if (otp && secret && verifyTotp(secret, otp)) return true;

  if (recoveryCode) {
    const codes = decryptRecoveryCodes(user.totpRecoveryCodesEncrypted);
    const wanted = recoveryDigest(recoveryCode);
    const index = codes.findIndex((item) => {
      const digest = recoveryDigest(item.code);
      return !item.usedAt && digest.length === wanted.length && timingSafeEqual(Buffer.from(digest), Buffer.from(wanted));
    });
    if (index >= 0) {
      codes[index] = { ...codes[index]!, usedAt: now().toISOString() };
      await dbRun(db.update(users).set({
        totpRecoveryCodesEncrypted: encryptRecoveryCodes(codes),
        updatedAt: now()
      }).where(eq(users.id, user.id)));
      return true;
    }
  }

  return false;
}
