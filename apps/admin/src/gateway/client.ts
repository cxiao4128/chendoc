import { resolveApiPath } from "../api/endpoints";

const PACKET_VERSION = "2.0";

interface PublicKeyResponse {
  keyId: string;
  publicKey: string;
}

interface ChallengeView {
  nonce: string;
  issuedAt: number | string;
  expireAt: number | string;
  mode?: string;
}

interface ChallengeBox {
  value: ChallengeView;
  expireAt: number;
}

interface GatewayResponsePacket<T = unknown> {
  code: number | string;
  message: string;
  data: T;
  timestamp: number;
  requestId: string;
}

interface PackedGatewayBody {
  envelope: { data: string };
  key: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let publicKeyCache: PublicKeyResponse | null = null;
let importedKeyCache: { keyId: string; key: CryptoKey } | null = null;
let challengeCache: ChallengeBox | null = null;

export const packetLayerDisabled =
  import.meta.env.DEV
  && (
    String(import.meta.env.VITE_DISABLE_PACKET_LAYER ?? "").toLowerCase() === "true"
    || String(import.meta.env.VITE_DISABLE_REQUEST_ENCRYPT ?? "").toLowerCase() === "true"
  );

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64ToJson(value: string) {
  return JSON.parse(textDecoder.decode(base64ToBytes(value))) as unknown;
}

function jsonToBase64(value: unknown) {
  return bytesToBase64(textEncoder.encode(JSON.stringify(value)));
}

function pemToBuffer(value: string) {
  return base64ToBytes(
    value
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, "")
  );
}

function readTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return 0;
}

function pickChallenge(input: unknown): ChallengeBox | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.nonce !== "string" || !row.nonce) return null;
  const expireAt = readTime(row.expireAt);
  if (!expireAt || expireAt <= Date.now()) return null;
  return {
    value: {
      nonce: row.nonce,
      issuedAt: typeof row.issuedAt === "number" || typeof row.issuedAt === "string" ? row.issuedAt : Date.now(),
      expireAt: typeof row.expireAt === "number" || typeof row.expireAt === "string" ? row.expireAt : expireAt,
      mode: typeof row.mode === "string" ? row.mode : undefined
    },
    expireAt
  };
}

async function fetchServerKey() {
  const response = await fetch("/api/crypto/public-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load gateway public key");
  return await response.json() as PublicKeyResponse;
}

async function serverKey() {
  const response = publicKeyCache ?? await fetchServerKey();
  if (importedKeyCache?.keyId === response.keyId) return importedKeyCache;

  const key = await crypto.subtle.importKey(
    "spki",
    pemToBuffer(response.publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  publicKeyCache = response;
  importedKeyCache = { keyId: response.keyId, key };
  return importedKeyCache;
}

async function gatewayChallenge() {
  if (challengeCache && challengeCache.expireAt - 5000 > Date.now()) return challengeCache.value;

  const response = await fetch("/api/crypto/challenge", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to load gateway challenge");
  const challenge = pickChallenge(await response.json());
  if (!challenge) throw new Error("Invalid gateway challenge");
  challengeCache = challenge;
  return challenge.value;
}

async function importAesKey(key: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, usages);
}

async function encryptServerKey(value: string) {
  const keyBox = await serverKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    keyBox.key,
    textEncoder.encode(value)
  );
  return {
    keyId: keyBox.keyId,
    key: bytesToBase64(encrypted)
  };
}

export async function packGatewayBody(body: unknown): Promise<PackedGatewayBody> {
  const [challenge] = await Promise.all([gatewayChallenge()]);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey = await encryptServerKey(bytesToBase64(key));
  const aes = await importAesKey(key, ["encrypt"]);
  const encryptedBody = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aes,
    textEncoder.encode(JSON.stringify(body ?? {}))
  );

  return {
    envelope: {
      data: jsonToBase64({
        v: PACKET_VERSION,
        keyId: encryptedKey.keyId,
        key: encryptedKey.key,
        iv: bytesToBase64(iv),
        challenge: challenge.nonce,
        timestamp: Date.now(),
        nonce: crypto.randomUUID(),
        body: bytesToBase64(encryptedBody)
      })
    },
    key
  };
}

function gatewayEnvelope(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const value = row.data ?? row.p;
  return typeof value === "string" && value ? value : null;
}

async function decryptGatewayResponse<T>(input: unknown, key: Uint8Array) {
  const encoded = gatewayEnvelope(input);
  if (!encoded) return input as T;

  const packet = base64ToJson(encoded);
  if (!packet || typeof packet !== "object") return packet as T;
  const row = packet as Record<string, unknown>;
  if (row.v !== PACKET_VERSION || typeof row.iv !== "string" || typeof row.body !== "string") {
    return packet as T;
  }

  const aes = await importAesKey(key, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(row.iv), tagLength: 128 },
    aes,
    base64ToBytes(row.body)
  );
  const responsePacket = JSON.parse(textDecoder.decode(plaintext)) as GatewayResponsePacket<T>;
  if (responsePacket.code === 0) return responsePacket.data as T;
  return {
    code: String(responsePacket.code),
    message: responsePacket.message,
    data: responsePacket.data
  } as T;
}

function parseBody(body: BodyInit | null | undefined) {
  if (!body) return {};
  if (typeof body !== "string") throw new Error("Gateway packet layer only supports JSON API bodies.");
  return JSON.parse(body) as unknown;
}

function apiTarget(url: string) {
  const target = new URL(url, window.location.origin);
  return `${target.pathname}${target.search}`;
}

export function shouldUseGateway(url: string, body?: BodyInit | null) {
  if (packetLayerDisabled) return false;
  if (body instanceof FormData) return false;
  const path = resolveApiPath(url);
  return path.startsWith("/api/")
    && path !== "/api/gateway"
    && path !== "/api/crypto/public-key"
    && path !== "/api/crypto/challenge"
    && path !== "/api/bootstrap";
}

export async function gatewayClientRequest<T>(url: string, options: RequestInit, headers: Headers) {
  const method = (options.method || "GET").toUpperCase();
  const packed = await packGatewayBody({
    method,
    path: apiTarget(url),
    body: parseBody(options.body)
  });
  const gatewayHeaders = new Headers(headers);
  gatewayHeaders.set("Content-Type", "application/json");

  const response = await fetch("/api/gateway", {
    ...options,
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify(packed.envelope)
  });
  const contentType = response.headers.get("Content-Type") || "";
  const rawPayload = contentType.includes("application/json") ? await response.json() : await response.text();
  const payload = await decryptGatewayResponse<T>(rawPayload, packed.key);
  return { response, payload };
}
