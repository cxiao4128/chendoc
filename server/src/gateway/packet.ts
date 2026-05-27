import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { decryptSubmittedValue } from "../modules/crypto/crypto.service.js";

const PACKET_VERSION = "2.0";
const PACKET_TTL_MS = 5 * 60 * 1000;

const nonceStore = new Map<string, number>();
const challengeStore = new Map<string, number>();

export interface GatewayPacketMeta {
  v: string;
  timestamp: number;
  nonce: string;
  challenge: string;
}

export interface GatewayUnpackedPacket {
  body: unknown;
  packet: GatewayPacketMeta;
  aesKey: Buffer;
}

export class GatewayPacketError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message = "请求结构不正确", statusCode = 400) {
    super(message);
    this.name = "GatewayPacketError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanupExpiringMap(store: Map<string, number>, now = Date.now()) {
  if (store.size < 512) return;
  for (const [key, expireAt] of store) {
    if (expireAt <= now) store.delete(key);
  }
}

function decodeBase64Json(input: string) {
  try {
    return JSON.parse(Buffer.from(input, "base64").toString("utf8")) as unknown;
  } catch {
    throw new GatewayPacketError("INVALID_PACKET");
  }
}

function encodeBase64Json(input: unknown) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64");
}

function encryptedRoot(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [key, value] = entries[0];
  if ((key !== "data" && key !== "p") || typeof value !== "string" || !value) return null;
  return value;
}

function packetObject(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayPacketError("INVALID_PACKET");
  }
  const row = input as Record<string, unknown>;
  const legacyChallenge = row.challenge && typeof row.challenge === "object" ? row.challenge as Record<string, unknown> : null;
  const challenge = typeof row.challenge === "string" ? row.challenge : legacyChallenge?.nonce;
  if (row.v !== PACKET_VERSION) throw new GatewayPacketError("INVALID_PACKET_VERSION");
  if (typeof row.keyId !== "string" || row.keyId.length < 8) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.key !== "string" || row.key.length < 40) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.iv !== "string" || row.iv.length < 12) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.body !== "string" || row.body.length < 16) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.nonce !== "string" || row.nonce.length < 16) throw new GatewayPacketError("INVALID_NONCE");
  if (typeof challenge !== "string" || !challenge) throw new GatewayPacketError("INVALID_CHALLENGE");

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
    challenge
  };
}

function validateTimestamp(timestamp: number) {
  if (Math.abs(Date.now() - timestamp) > PACKET_TTL_MS) {
    throw new GatewayPacketError("INVALID_TIMESTAMP", "请求已过期");
  }
}

function validateNonce(nonce: string) {
  const now = Date.now();
  cleanupExpiringMap(nonceStore, now);
  const existing = nonceStore.get(nonce);
  if (existing && existing > now) {
    throw new GatewayPacketError("INVALID_NONCE", "请求已重复提交");
  }
  nonceStore.set(nonce, now + PACKET_TTL_MS);
}

function validateChallenge(challenge: string) {
  const now = Date.now();
  cleanupExpiringMap(challengeStore, now);
  const expireAt = challengeStore.get(challenge);
  if (!expireAt || expireAt <= now) {
    challengeStore.delete(challenge);
    throw new GatewayPacketError("INVALID_CHALLENGE", "请求校验已过期");
  }
}

function decryptAesGcmBody(key: Buffer, ivBase64: string, bodyBase64: string) {
  const iv = Buffer.from(ivBase64, "base64");
  const raw = Buffer.from(bodyBase64, "base64");
  if (iv.length !== 12 || raw.length <= 16) throw new GatewayPacketError("INVALID_PACKET");

  const ciphertext = raw.subarray(0, -16);
  const tag = raw.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptAesGcmBody(key: Buffer, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]).toString("base64");
  return {
    iv: iv.toString("base64"),
    body
  };
}

export function isGatewayEnvelope(input: unknown): input is { data: string } | { p: string } {
  return encryptedRoot(input) !== null;
}

export function issueGatewayChallenge() {
  const issuedAt = Date.now();
  const nonce = randomUUID();
  cleanupExpiringMap(challengeStore, issuedAt);
  challengeStore.set(nonce, issuedAt + PACKET_TTL_MS);
  return {
    nonce,
    issuedAt,
    expireAt: issuedAt + PACKET_TTL_MS,
    mode: "gateway"
  };
}

export async function unpackGatewayPacket(input: unknown): Promise<GatewayUnpackedPacket> {
  const encoded = encryptedRoot(input);
  if (!encoded) throw new GatewayPacketError("INVALID_PACKET");
  const packet = packetObject(decodeBase64Json(encoded));

  validateTimestamp(packet.timestamp);
  validateNonce(packet.nonce);
  validateChallenge(packet.challenge);

  const aesKeyBase64 = await decryptSubmittedValue(packet.keyId, packet.key);
  const aesKey = Buffer.from(aesKeyBase64, "base64");
  if (aesKey.length !== 32) throw new GatewayPacketError("INVALID_PACKET");

  let body: unknown;
  try {
    body = JSON.parse(decryptAesGcmBody(aesKey, packet.iv, packet.body));
  } catch (error) {
    if (error instanceof GatewayPacketError) throw error;
    throw new GatewayPacketError("INVALID_PACKET");
  }

  return {
    body,
    packet: {
      v: packet.v,
      timestamp: packet.timestamp,
      nonce: packet.nonce,
      challenge: packet.challenge
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
  const message = typeof row.message === "string" ? row.message : isOk ? "ok" : "请求失败";
  const responsePacket = {
    code,
    message,
    data: isOk ? input.payload : row.data ?? null,
    timestamp: Date.now(),
    requestId: input.requestId
  };

  if (input.aesKey?.length === 32) {
    const encrypted = encryptAesGcmBody(input.aesKey, JSON.stringify(responsePacket));
    return {
      data: encodeBase64Json({
        v: PACKET_VERSION,
        iv: encrypted.iv,
        body: encrypted.body
      })
    };
  }

  return { data: encodeBase64Json(responsePacket) };
}
