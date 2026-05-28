import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import {
  decryptSubmittedValue,
  decryptSubmittedValueWithActiveKey
} from "../modules/crypto/crypto.service.js";

const PACKET_VERSION = "2.1";
const REQUEST_PREFIX = "G21";
const RESPONSE_PREFIX = "G21R";
const PACKET_TTL_MS = 5 * 60 * 1000;

const nonceStore = new Map<string, number>();
const challengeStore = new Map<string, number>();

export interface GatewayPacketMeta {
  v: string;
  timestamp: number;
  nonce: string;
  challenge: string;
  actionCode: string;
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

function cleanupExpiringMap(store: Map<string, number>, now = Date.now()) {
  if (store.size < 512) return;
  for (const [key, expireAt] of store) {
    if (expireAt <= now) store.delete(key);
  }
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
  if (parts.length !== 4 || parts[0] !== REQUEST_PREFIX) {
    throw new GatewayPacketError("INVALID_PACKET");
  }

  const [, encryptedKey, ivValue, bodyValue] = parts;
  const iv = base64urlDecode(ivValue);
  const encryptedBody = base64urlDecode(bodyValue);
  if (iv.length !== 12 || encryptedBody.length <= 16) throw new GatewayPacketError("INVALID_PACKET");

  const keyPlaintext = await decryptSubmittedValueWithActiveKey(decodeTransportKey(encryptedKey));
  const key = Buffer.from(keyPlaintext, "base64");
  if (key.length !== 32) throw new GatewayPacketError("INVALID_PACKET");

  const plaintext = decryptAesGcmBody(key, iv, encryptedBody);
  try {
    return JSON.parse(plaintext) as unknown;
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
  if (typeof row.keyId !== "string" || row.keyId.length < 8) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.key !== "string" || row.key.length < 40) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.iv !== "string" || row.iv.length < 12) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.body !== "string" || row.body.length < 16) throw new GatewayPacketError("INVALID_PACKET");
  if (typeof row.nonce !== "string" || row.nonce.length < 16) throw new GatewayPacketError("INVALID_NONCE");
  if (typeof row.challenge !== "string" || !row.challenge) throw new GatewayPacketError("INVALID_CHALLENGE");
  if (typeof row.action !== "string" || !/^[a-z][0-9]+$/i.test(row.action)) {
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
    action: row.action
  };
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
  cleanupExpiringMap(nonceStore, now);
  const existing = nonceStore.get(nonce);
  if (existing && existing > now) {
    throw new GatewayPacketError("INVALID_NONCE", "Gateway packet replayed.");
  }
  nonceStore.set(nonce, now + PACKET_TTL_MS);
}

function validateChallenge(challenge: string) {
  const now = Date.now();
  cleanupExpiringMap(challengeStore, now);
  const expireAt = challengeStore.get(challenge);
  if (!expireAt || expireAt <= now) {
    challengeStore.delete(challenge);
    throw new GatewayPacketError("INVALID_CHALLENGE", "Gateway challenge expired.");
  }
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
  const packet = packetObject(await decryptOuterEnvelope(encoded));

  validateTimestamp(packet.timestamp);
  validateNonce(packet.nonce);
  validateChallenge(packet.challenge);

  const aesKeyBase64 = await decryptSubmittedValue(packet.keyId, decodeTransportKey(packet.key));
  const aesKey = Buffer.from(aesKeyBase64, "base64");
  if (aesKey.length !== 32) throw new GatewayPacketError("INVALID_PACKET");

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
