import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  decryptSubmittedValue,
} from "../modules/crypto/crypto.service.js";

const PACKET_VERSION = "xchen";
const REQUEST_PREFIX = "chendoc";
const RESPONSE_PREFIX = "XCHEN";
const PACKET_TTL_MS = 5 * 60 * 1000;
const MAX_NONCES = 10_000;
const MAX_CHALLENGES = 5_000;

const nonceStore = new Map<string, number>();
const challengeStore = new Map<string, ChallengeRecord>();

type ChallengeRecord = {
  nonce: string;
  ip: string;
  userAgent: string;
  fingerprint: string;
  issuedAt: number;
  expireAt: number;
  action?: string;
  used: boolean;
};

export interface GatewayPacketMeta {
  v: string;
  timestamp: number;
  nonce: string;
  challenge: string;
  actionCode: string;
}

export interface GatewayRequestContext {
  ip?: string;
  userAgent?: string | string[];
  fingerprint?: string;
}

export interface GatewayUnpackedPacket {
  body: unknown;
  packet: GatewayPacketMeta;
  aesKey: Buffer;
}

export class GatewayPacketError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message = "Invalid gateway packet.", statusCode = 400) {
    super(message);
    this.name = "GatewayPacketError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanupNonceMap(store: Map<string, number>, now = Date.now()) {
  if (store.size < 512) return;
  for (const [key, expireAt] of store) {
    if (expireAt <= now) store.delete(key);
  }
  while (store.size >= MAX_NONCES) store.delete(store.keys().next().value!);
}

function cleanupChallengeMap(now = Date.now()) {
  if (challengeStore.size < 512) return;
  for (const [key, value] of challengeStore) {
    if (value.expireAt <= now || value.used) challengeStore.delete(key);
  }
  while (challengeStore.size >= MAX_CHALLENGES) challengeStore.delete(challengeStore.keys().next().value!);
}

function base64urlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

function base64urlDecode(value: string) {
  try {
    return Buffer.from(base64urlToBase64(value), "base64");
  } catch {
    throw new GatewayPacketError("INVALID_PACKET");
  }
}

function base64urlEncode(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function decodeTransportKey(value: string) {
  return base64urlToBase64(value);
}

function encryptedRoot(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [key, value] = entries[0];
  if (key !== "data" || typeof value !== "string" || !value) return null;
  return value;
}

async function decryptOuterEnvelope(input: string) {
  const parts = input.split(".");
  if (parts.length !== 5 || parts[0] !== REQUEST_PREFIX) {
    throw new GatewayPacketError("INVALID_PACKET");
  }

  const [, keyId, encryptedKey, ivValue, bodyValue] = parts;
  const iv = base64urlDecode(ivValue);
  const encryptedBody = base64urlDecode(bodyValue);
  if (iv.length !== 12 || encryptedBody.length <= 16) throw new GatewayPacketError("INVALID_PACKET");

  const keyPlaintext = await decryptSubmittedValue(keyId, decodeTransportKey(encryptedKey));
  const key = Buffer.from(keyPlaintext, "base64");
  if (key.length !== 32) throw new GatewayPacketError("INVALID_PACKET");

  const plaintext = decryptAesGcmBody(key, iv, encryptedBody);
  try {
    return { packet: JSON.parse(plaintext) as unknown, key };
  } catch {
    throw new GatewayPacketError("INVALID_PACKET");
  }
}

function packetObject(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayPacketError("INVALID_PACKET");
  }
  const row = input as Record<string, unknown>;
  if (row.v !== PACKET_VERSION) throw new GatewayPacketError("INVALID_PACKET_VERSION");
  if (row.keyId !== undefined && (typeof row.keyId !== "string" || row.keyId.length < 8)) throw new GatewayPacketError("INVALID_PACKET");
  if (row.key !== undefined && (typeof row.key !== "string" || row.key.length < 40)) throw new GatewayPacketError("INVALID_PACKET");
  if ((row.keyId === undefined) !== (row.key === undefined)) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.iv !== "string" || row.iv.length < 12) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.body !== "string" || row.body.length < 16) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.nonce !== "string" || row.nonce.length < 16) throw new GatewayPacketError("INVALID_NONCE");
  if (typeof row.challenge !== "string" || !row.challenge) throw new GatewayPacketError("INVALID_CHALLENGE");
  if (typeof row.fingerprint !== "string" || row.fingerprint.length < 12) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.signature !== "string" || row.signature.length < 32) throw new GatewayPacketError("INVALID_SIGNATURE");
  if (!validGatewayActionShape(row.action)) {
    throw new GatewayPacketError("INVALID_ACTION");
  }

  const timestamp = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp);
  if (!Number.isFinite(timestamp)) throw new GatewayPacketError("INVALID_TIMESTAMP");

  return {
    v: row.v,
    keyId: row.keyId,
    key: row.key,
    iv: row.iv,
    body: row.body,
    timestamp,
    nonce: row.nonce,
    challenge: row.challenge,
    fingerprint: row.fingerprint,
    signature: row.signature,
    action: row.action
  };
}

function validGatewayActionShape(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]+[0-9]+$/i.test(value);
}

function normalizeTimestamp(timestamp: number) {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function validateTimestamp(timestamp: number) {
  if (Math.abs(Date.now() - normalizeTimestamp(timestamp)) > PACKET_TTL_MS) {
    throw new GatewayPacketError("INVALID_TIMESTAMP", "Gateway packet expired.");
  }
}

function validateNonce(nonce: string) {
  const now = Date.now();
  cleanupNonceMap(nonceStore, now);
  const existing = nonceStore.get(nonce);
  if (existing && existing > now) {
    throw new GatewayPacketError("INVALID_NONCE", "Gateway packet replayed.");
  }
  nonceStore.set(nonce, now + PACKET_TTL_MS);
}

function normalizeUserAgent(userAgent?: string | string[]) {
  return Array.isArray(userAgent) ? userAgent.join(", ") : userAgent || "";
}

function validateChallenge(challenge: string, packet: { action: string; fingerprint: string }, context: GatewayRequestContext = {}) {
  const now = Date.now();
  cleanupChallengeMap(now);
  const record = challengeStore.get(challenge);
  if (!record || record.expireAt <= now || record.used) {
    challengeStore.delete(challenge);
    throw new GatewayPacketError("INVALID_CHALLENGE", "Gateway challenge expired.");
  }
  if (
    record.ip !== (context.ip || "") ||
    record.userAgent !== normalizeUserAgent(context.userAgent) ||
    record.fingerprint !== packet.fingerprint ||
    record.issuedAt > now ||
    record.expireAt - record.issuedAt > PACKET_TTL_MS ||
    record.action && record.action !== packet.action
  ) {
    challengeStore.delete(challenge);
    throw new GatewayPacketError("INVALID_CHALLENGE");
  }
  record.used = true;
  challengeStore.delete(challenge);
}

function decryptAesGcmBody(key: Buffer, iv: Buffer, raw: Buffer) {
  if (iv.length !== 12 || raw.length <= 16) throw new GatewayPacketError("INVALID_PACKET");

  const ciphertext = raw.subarray(0, -16);
  const tag = raw.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decryptTransportBody(key: Buffer, ivValue: string, bodyValue: string) {
  try {
    return decryptAesGcmBody(key, base64urlDecode(ivValue), base64urlDecode(bodyValue));
  } catch (error) {
    if (error instanceof GatewayPacketError) throw error;
    throw new GatewayPacketError("INVALID_PACKET");
  }
}

function encryptAesGcmBody(key: Buffer, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return {
    iv: base64urlEncode(iv),
    body: base64urlEncode(body)
  };
}

export function isGatewayEnvelope(input: unknown): input is { data: string } {
  return encryptedRoot(input) !== null;
}

export function issueGatewayChallenge(context: GatewayRequestContext & { action?: string } = {}) {
  const issuedAt = Date.now();
  const nonce = randomUUID();
  const expireAt = issuedAt + PACKET_TTL_MS;
  const fingerprint = context.fingerprint || "";
  if (!fingerprint) throw new GatewayPacketError("INVALID_CHALLENGE");
  cleanupChallengeMap(issuedAt);
  challengeStore.set(nonce, {
    nonce,
    ip: context.ip || "",
    userAgent: normalizeUserAgent(context.userAgent),
    fingerprint,
    issuedAt,
    expireAt,
    action: context.action,
    used: false
  });
  return {
    nonce,
    issuedAt,
    expireAt,
    mode: "gateway",
    action: context.action || null
  };
}

export const __testing = {
  consumeChallenge: (challenge: string, action = "x0", fingerprint = "test-fingerprint") =>
    validateChallenge(challenge, { action, fingerprint }, { fingerprint }),
  validGatewayActionShape
};

function signatureInput(packet: { action: string; timestamp: number; nonce: string; body: string; challenge: string }) {
  return [packet.action, String(packet.timestamp), packet.nonce, packet.body, packet.challenge].join("\n");
}

function validateSignature(aesKey: Buffer, packet: { action: string; timestamp: number; nonce: string; body: string; challenge: string; signature: string }) {
  const expected = createHmac("sha256", aesKey).update(signatureInput(packet)).digest();
  const actual = base64urlDecode(packet.signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new GatewayPacketError("INVALID_SIGNATURE");
  }
}

export async function unpackGatewayPacket(input: unknown, context: GatewayRequestContext = {}): Promise<GatewayUnpackedPacket> {
  const encoded = encryptedRoot(input);
  if (!encoded) throw new GatewayPacketError("INVALID_PACKET");
  const outer = await decryptOuterEnvelope(encoded);
  const packet = packetObject(outer.packet);

  validateTimestamp(packet.timestamp);
  validateNonce(packet.nonce);
  validateChallenge(packet.challenge, packet, context);

  const aesKey = packet.keyId && packet.key
    ? Buffer.from(await decryptSubmittedValue(packet.keyId, decodeTransportKey(packet.key)), "base64")
    : outer.key;
  if (aesKey.length !== 32) throw new GatewayPacketError("INVALID_PACKET");
  validateSignature(aesKey, packet);

  let body: unknown;
  try {
    body = JSON.parse(decryptTransportBody(aesKey, packet.iv, packet.body));
  } catch (error) {
    if (error instanceof GatewayPacketError) throw error;
    throw new GatewayPacketError("INVALID_PACKET");
  }

  return {
    body,
    packet: {
      v: packet.v,
      timestamp: normalizeTimestamp(packet.timestamp),
      nonce: packet.nonce,
      challenge: packet.challenge,
      actionCode: packet.action
    } satisfies GatewayPacketMeta,
    aesKey
  };
}

export function packGatewayResponse(input: {
  requestId: string;
  statusCode: number;
  payload: unknown;
  aesKey?: Buffer;
}) {
  const row = input.payload && typeof input.payload === "object" ? input.payload as Record<string, unknown> : {};
  const isOk = input.statusCode < 400;
  const code = isOk ? 0 : String(row.code || row.errorCode || input.statusCode);
  const message = typeof row.message === "string" ? row.message : isOk ? "ok" : "Gateway request failed.";
  const responsePacket = {
    v: PACKET_VERSION,
    code,
    message,
    data: isOk ? input.payload : row.data ?? null,
    timestamp: Date.now(),
    requestId: input.requestId
  };

  if (input.aesKey?.length === 32) {
    const encrypted = encryptAesGcmBody(input.aesKey, JSON.stringify(responsePacket));
    return {
      data: `${RESPONSE_PREFIX}.${encrypted.iv}.${encrypted.body}`
    };
  }

  return {
    data: base64urlEncode(randomBytes(32))
  };
}
