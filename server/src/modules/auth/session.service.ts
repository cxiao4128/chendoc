import { createHash, randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { authSessions } from "../../db/schema.js";
import { jwtExpiresAt, signJwt, verifyJwt, type JwtUser } from "../../config/jwt.js";
import { now } from "../../utils/date.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { env } from "../../config/env.js";

const MIN_AUTH_SESSION_MS = 60 * 60 * 1000;
// IDLE_TIMEOUT_MS: 从环境变量读取，默认 90 分钟（给 2 小时 JWT 预留缓冲）
const IDLE_TIMEOUT_MS = env.idleTimeoutMs;
const ROTATION_GRACE_MS = 30_000;
const recentRenewals = new Map<string, { sourceDigest: string; token: string; expiresAt: Date; validUntil: number }>();

type TokenDigestState = {
  current: string;
  previous?: string;
  previousValidUntil?: number;
};

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

function parseDigestState(value: string): TokenDigestState {
  if (!value.startsWith("{")) return { current: value };
  try {
    const parsed = JSON.parse(value) as TokenDigestState;
    if (typeof parsed.current === "string" && parsed.current.startsWith("jwt:")) return parsed;
  } catch {
    // Legacy/invalid values fail closed below.
  }
  return { current: "invalid" };
}

function serializeDigestState(state: TokenDigestState) {
  return JSON.stringify(state);
}

function cleanupExpiredRecentRenewals(currentTime = Date.now()) {
  for (const [sessionId, renewal] of recentRenewals) {
    if (renewal.validUntil <= currentTime) recentRenewals.delete(sessionId);
  }
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

export async function renewAuthSession(
  sessionId: string,
  user: Omit<JwtUser, "exp" | "iat" | "jti" | "sessionTokenDigest">,
  presentedDigest: string
) {
  cleanupExpiredRecentRenewals();
  const cached = recentRenewals.get(sessionId);
  if (cached && cached.sourceDigest === presentedDigest && cached.validUntil > Date.now()) {
    return { token: cached.token, expiresAt: cached.expiresAt };
  }
  const existing = await dbGet<typeof authSessions.$inferSelect>(db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1));
  if (!existing || existing.userId !== user.id || existing.expireAt.getTime() <= Date.now()) {
    throw new Error("Session expired.");
  }
  const existingState = parseDigestState(existing.keyEncrypted);
  if (!presentedDigest || existingState.current !== presentedDigest) {
    throw new Error("Session token has already been rotated.");
  }

  const jwtToken = signJwt(user, sessionId);
  const expireAt = jwtExpiresAt(jwtToken) ?? fallbackExpireAt();
  const nextState = serializeDigestState({
    current: tokenDigest(jwtToken),
    previous: existingState.current,
    previousValidUntil: Date.now() + ROTATION_GRACE_MS
  });
  const result = await dbRun(db.update(authSessions).set({
    keyEncrypted: nextState,
    expireAt,
    lastSeenAt: now(),
    version: existing.version + 1
  }).where(and(
    eq(authSessions.id, sessionId),
    eq(authSessions.keyEncrypted, existing.keyEncrypted),
    eq(authSessions.version, existing.version)
  )));
  if (result.changes !== 1) {
    const concurrent = recentRenewals.get(sessionId);
    if (concurrent && concurrent.sourceDigest === presentedDigest && concurrent.validUntil > Date.now()) {
      return { token: concurrent.token, expiresAt: concurrent.expiresAt };
    }
    throw new Error("Concurrent session refresh rejected.");
  }
  const encryptedToken = encryptJwtForClient(jwtToken);
  recentRenewals.set(sessionId, {
    sourceDigest: presentedDigest,
    token: encryptedToken,
    expiresAt: expireAt,
    validUntil: Date.now() + ROTATION_GRACE_MS
  });
  return { token: encryptedToken, expiresAt: expireAt };
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
  const digest = tokenDigest(token);
  const digestState = session ? parseDigestState(session.keyEncrypted) : null;
  const digestAccepted = !!digestState && (
    digestState.current === digest ||
    (digestState.previous === digest && (digestState.previousValidUntil ?? 0) >= currentTime)
  );
  if (
    !session ||
    session.expireAt.getTime() <= currentTime ||
    session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS <= currentTime ||
    session.userId !== payload.id ||
    !digestAccepted
  ) {
    throw new Error("Session expired.");
  }

  await dbRun(db.update(authSessions).set({ lastSeenAt: now() }).where(eq(authSessions.id, sessionId)));
  return {
    userId: session.userId,
    sessionId,
    tokenDigest: digest,
    tokenExpiresAt: payload.exp ? new Date(payload.exp * 1000) : session.expireAt
  };
}

export async function verifyAuthSessionHeader(header: string) {
  return verifyAuthSessionToken(bearerToken(header));
}

export async function revokeAuthSession(sessionId: string) {
  recentRenewals.delete(sessionId);
  await dbRun(db.delete(authSessions).where(eq(authSessions.id, sessionId)));
}

export async function revokeUserAuthSessions(userId: number) {
  for (const sessionId of recentRenewals.keys()) {
    const session = await dbGet<typeof authSessions.$inferSelect>(db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1));
    if (session?.userId === userId) recentRenewals.delete(sessionId);
  }
  await dbRun(db.delete(authSessions).where(eq(authSessions.userId, userId)));
}

export async function cleanupExpiredAuthSessions() {
  cleanupExpiredRecentRenewals();
  await dbRun(db.delete(authSessions).where(lt(authSessions.expireAt, now())));
}

export const __testing = {
  recentRenewalCount: () => recentRenewals.size,
  clearRecentRenewals: () => recentRenewals.clear()
};
