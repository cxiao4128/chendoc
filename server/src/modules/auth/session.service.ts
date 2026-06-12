import { createHash, randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { authSessions } from "../../db/schema.js";
import { jwtExpiresAt, signJwt, verifyJwt, type JwtUser } from "../../config/jwt.js";
import { now } from "../../utils/date.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { env } from "../../config/env.js";

const MIN_AUTH_SESSION_MS = 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function parseDurationMs(value: string) {
  const match = value.trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 2 * MIN_AUTH_SESSION_MS;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return Math.max(amount * multipliers[unit], MIN_AUTH_SESSION_MS);
}

function tokenDigest(token: string) {
  return `jwt:${createHash("sha256").update(token).digest("hex")}`;
}

function base64ToBase64url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return normalized + "=".repeat((4 - normalized.length % 4) % 4);
}

function encryptJwtForClient(token: string) {
  const [version, iv, tag, body] = encryptValue(token, env.configEncryptionKey).split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unable to encrypt auth token.");
  return ["CDJ1", iv, tag, body].map((part, index) => index === 0 ? part : base64ToBase64url(part)).join(".");
}

function decryptJwtFromClient(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "CDJ1") {
    throw new Error("Invalid authorization token.");
  }
  return decryptValue(`v1:${base64urlToBase64(parts[1]!)}:${base64urlToBase64(parts[2]!)}:${base64urlToBase64(parts[3]!)}`, env.configEncryptionKey);
}

function bearerToken(header: string) {
  const match = header.trim().match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Invalid authorization header.");
  return match[1]!.trim();
}

function fallbackExpireAt() {
  return new Date(Date.now() + parseDurationMs(env.jwtExpiresIn));
}

export async function createAuthSession(user: Omit<JwtUser, "exp" | "iat" | "jti">) {
  const sessionId = randomUUID();
  const jwtToken = signJwt(user, sessionId);
  const expireAt = jwtExpiresAt(jwtToken) ?? fallbackExpireAt();
  const createdAt = now();

  await dbRun(db.insert(authSessions).values({
    id: sessionId,
    userId: user.id,
    keyEncrypted: tokenDigest(jwtToken),
    expireAt,
    lastSeenAt: createdAt,
    createdAt
  }));

  return { token: encryptJwtForClient(jwtToken), expiresAt: expireAt };
}

export async function renewAuthSession(sessionId: string, user: Omit<JwtUser, "exp" | "iat" | "jti">) {
  const existing = await dbGet<typeof authSessions.$inferSelect>(db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1));
  if (!existing || existing.userId !== user.id || existing.expireAt.getTime() <= Date.now()) {
    throw new Error("Session expired.");
  }

  const jwtToken = signJwt(user, sessionId);
  const expireAt = jwtExpiresAt(jwtToken) ?? fallbackExpireAt();
  await dbRun(db.update(authSessions).set({
    keyEncrypted: tokenDigest(jwtToken),
    expireAt,
    lastSeenAt: now()
  }).where(eq(authSessions.id, sessionId)));
  return { token: encryptJwtForClient(jwtToken), expiresAt: expireAt };
}

export async function verifyAuthSessionToken(encryptedToken: string) {
  const token = decryptJwtFromClient(encryptedToken);
  const payload = verifyJwt(token);
  const sessionId = payload.sessionId!;

  const session = await dbGet<typeof authSessions.$inferSelect>(db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1));
  const currentTime = Date.now();
  if (
    !session ||
    session.expireAt.getTime() <= currentTime ||
    session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS <= currentTime ||
    session.userId !== payload.id ||
    session.keyEncrypted !== tokenDigest(token)
  ) {
    throw new Error("Session expired.");
  }

  await dbRun(db.update(authSessions).set({ lastSeenAt: now() }).where(eq(authSessions.id, sessionId)));
  return { userId: session.userId, sessionId, tokenExpiresAt: payload.exp ? new Date(payload.exp * 1000) : session.expireAt };
}

export async function verifyAuthSessionHeader(header: string) {
  return verifyAuthSessionToken(bearerToken(header));
}

export async function revokeAuthSession(sessionId: string) {
  await dbRun(db.delete(authSessions).where(eq(authSessions.id, sessionId)));
}

export async function revokeUserAuthSessions(userId: number) {
  await dbRun(db.delete(authSessions).where(eq(authSessions.userId, userId)));
}

export async function cleanupExpiredAuthSessions() {
  await dbRun(db.delete(authSessions).where(lt(authSessions.expireAt, now())));
}
