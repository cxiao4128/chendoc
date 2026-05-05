import { createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { authSessions } from "../../db/schema.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { now } from "../../utils/date.js";

const authPayloadSchema = z.object({
  sid: z.string().min(8),
  t: z.number().int().positive()
});

function parseDurationMs(value: string) {
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 2 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return amount * multipliers[unit];
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function uuidFromBytes(bytes: Buffer) {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

function deriveAuthIv(key: Buffer, sessionId: string, nonce: Buffer) {
  return createHash("sha256")
    .update("chendoc-auth-iv-v1")
    .update(sessionId)
    .update(nonce)
    .update(key)
    .digest()
    .subarray(0, 12);
}

function decryptAuthPayload(key: Buffer, sessionId: string, nonce: Buffer, raw: Buffer) {
  if (raw.length <= 16) throw new Error("Invalid authorization payload.");

  const ciphertext = raw.subarray(0, -16);
  const tag = raw.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, deriveAuthIv(key, sessionId, nonce));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function createAuthSession(userId: number) {
  const sessionId = randomUUID();
  const sessionKey = randomBytes(32).toString("base64");
  const createdAt = now();
  const expireAt = new Date(createdAt.getTime() + parseDurationMs(env.jwtExpiresIn));

  db.insert(authSessions).values({
    id: sessionId,
    userId,
    keyEncrypted: encryptValue(sessionKey, env.configEncryptionKey),
    expireAt,
    createdAt
  }).run();

  return { sessionId, sessionKey };
}

export function verifyAuthSessionHeader(header: string) {
  const raw = base64UrlDecode(header.trim());
  if (raw.length <= 33 || raw[0] !== 1) {
    throw new Error("Invalid authorization payload.");
  }

  const sessionId = uuidFromBytes(raw.subarray(1, 17));
  const nonce = raw.subarray(17, 33);
  const payload = raw.subarray(33);

  const session = db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1)
    .get();
  if (!session || session.expireAt.getTime() <= Date.now()) {
    throw new Error("Session expired");
  }

  const key = Buffer.from(decryptValue(session.keyEncrypted, env.configEncryptionKey), "base64");
  if (key.length !== 32) {
    throw new Error("Invalid session key");
  }

  const authPayload = authPayloadSchema.parse(JSON.parse(decryptAuthPayload(key, sessionId, nonce, payload)));
  if (authPayload.sid !== sessionId || Math.abs(Date.now() - authPayload.t) > 5 * 60 * 1000) {
    throw new Error("Invalid authorization payload");
  }

  return { userId: session.userId };
}

export function cleanupExpiredAuthSessions() {
  db.delete(authSessions).where(lt(authSessions.expireAt, now())).run();
}
