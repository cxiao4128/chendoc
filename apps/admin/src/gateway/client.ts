import { resolveApiPath } from "../api/endpoints";

const PACKET_VERSION = "2.1";
const REQUEST_PREFIX = "G21";
const RESPONSE_PREFIX = "G21R";

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
  v: string;
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

interface GatewayAction {
  action: string;
  payload: Record<string, unknown>;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let publicKeyCache: PublicKeyResponse | null = null;
let importedKeyCache: { keyId: string; key: CryptoKey } | null = null;
let challengeCache: ChallengeBox | null = null;

export const packetLayerDisabled =
  import.meta.env.DEV
  && (
    String(import.meta.env.VITE_DISABLE_GATEWAY_PACKET ?? "").toLowerCase() === "true"
    || String(import.meta.env.VITE_DISABLE_PACKET_LAYER ?? "").toLowerCase() === "true"
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

function base64ToBase64url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

function bytesToBase64url(bytes: ArrayBuffer | Uint8Array) {
  return base64ToBase64url(bytesToBase64(bytes));
}

function base64urlToBytes(value: string) {
  return base64ToBytes(base64urlToBase64(value));
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
    key: bytesToBase64url(encrypted)
  };
}

async function encryptAesGcm(key: Uint8Array, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await importAesKey(key, ["encrypt"]);
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aes,
    textEncoder.encode(JSON.stringify(value ?? {}))
  );
  return {
    iv: bytesToBase64url(iv),
    body: bytesToBase64url(body)
  };
}

export async function packGatewayBody(body: unknown, action = "x0"): Promise<PackedGatewayBody> {
  const [challenge] = await Promise.all([gatewayChallenge()]);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = await encryptServerKey(bytesToBase64(key));
  const encryptedBody = await encryptAesGcm(key, body);

  const packet = {
    v: PACKET_VERSION,
    keyId: encryptedKey.keyId,
    key: encryptedKey.key,
    iv: encryptedBody.iv,
    challenge: challenge.nonce,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    action,
    body: encryptedBody.body
  };

  const outerKey = crypto.getRandomValues(new Uint8Array(32));
  const encryptedOuterKey = await encryptServerKey(bytesToBase64(outerKey));
  const encryptedPacket = await encryptAesGcm(outerKey, packet);

  return {
    envelope: {
      data: [
        REQUEST_PREFIX,
        encryptedOuterKey.key,
        encryptedPacket.iv,
        encryptedPacket.body
      ].join(".")
    },
    key
  };
}

function gatewayEnvelope(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  return typeof row.data === "string" && row.data ? row.data : null;
}

async function decryptGatewayResponse<T>(input: unknown, key: Uint8Array) {
  const encoded = gatewayEnvelope(input);
  if (!encoded) return input as T;
  const parts = encoded.split(".");
  if (parts.length !== 3 || parts[0] !== RESPONSE_PREFIX) return input as T;

  const aes = await importAesKey(key, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(parts[1]), tagLength: 128 },
    aes,
    base64urlToBytes(parts[2])
  );
  const responsePacket = JSON.parse(textDecoder.decode(plaintext)) as GatewayResponsePacket<T>;
  if (responsePacket.v !== PACKET_VERSION) throw new Error("Invalid gateway response");
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

function urlView(url: string) {
  return new URL(url, window.location.origin);
}

function queryPayload(url: URL) {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

function actionPayload(
  action: string,
  input: {
    body?: unknown;
    params?: Record<string, string | number>;
    query?: Record<string, string>;
    target?: string;
    mode?: string;
    scope?: string;
  } = {}
): GatewayAction {
  return {
    action,
    payload: {
      ...(input.params ? { params: input.params } : {}),
      ...(input.query && Object.keys(input.query).length ? { query: input.query } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      body: input.body ?? {}
    }
  };
}

function resolveGatewayAction(url: string, method: string, body: unknown): GatewayAction {
  const parsed = urlView(url);
  const path = parsed.pathname;
  const query = queryPayload(parsed);

  if (method === "POST" && path === "/api/auth/login") return actionPayload("a1", { body });
  if (method === "POST" && path === "/api/auth/register") return actionPayload("a2", { body });
  if ((method === "POST" || method === "GET") && path === "/api/auth/me") return actionPayload("a3");
  if (method === "POST" && path === "/api/auth/change-password") return actionPayload("a4", { body });

  if (method === "GET" && path === "/api/captcha") return actionPayload("c1");
  if (method === "GET" && path === "/api/public/settings/site") return actionPayload("p1");

  const publicSharePassword = path.match(/^\/api\/public\/r\/([^/]+)\/verify-password$/);
  if (method === "POST" && publicSharePassword) {
    return actionPayload("p2", { params: { shareKey: decodeURIComponent(publicSharePassword[1]) }, body });
  }

  if (method === "GET" && path === "/api/docs") return actionPayload("d1", { query });
  if (method === "GET" && path === "/api/docs/search") return actionPayload("d1", { query, mode: "search" });
  if (method === "POST" && path === "/api/docs") return actionPayload("d3", { body });
  if (method === "POST" && path === "/api/docs/bulk-delete") return actionPayload("d5", { body });

  if (method === "GET" && path === "/api/docs/trash") return actionPayload("r1", { query });
  if (method === "POST" && path === "/api/docs/trash/batch-restore") return actionPayload("r2", { body });
  if (method === "POST" && path === "/api/docs/trash/batch-delete") return actionPayload("r3", { body });
  if (method === "GET" && path === "/api/admin/docs/trash") return actionPayload("r1", { query, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-restore") return actionPayload("r2", { body, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-hard-delete") return actionPayload("r3", { body, scope: "admin" });

  const docVersionRestore = path.match(/^\/api\/docs\/(\d+)\/versions\/(\d+)\/restore$/);
  if (method === "POST" && docVersionRestore) {
    return actionPayload("d8", { params: { id: docVersionRestore[1], versionId: docVersionRestore[2] } });
  }
  const docVersions = path.match(/^\/api\/docs\/(\d+)\/versions$/);
  if (method === "GET" && docVersions) return actionPayload("d7", { params: { id: docVersions[1] } });
  const docPublish = path.match(/^\/api\/docs\/(\d+)\/publish$/);
  if (method === "POST" && docPublish) return actionPayload("d6", { params: { id: docPublish[1] } });
  const docShare = path.match(/^\/api\/docs\/(\d+)\/share$/);
  if (method === "POST" && docShare) return actionPayload("h1", { params: { docId: docShare[1] }, body });
  const docDetail = path.match(/^\/api\/docs\/(\d+)$/);
  if (method === "GET" && docDetail) return actionPayload("d2", { params: { id: docDetail[1] } });
  if (method === "PATCH" && docDetail) return actionPayload("d3", { params: { id: docDetail[1] }, body });
  if (method === "DELETE" && docDetail) return actionPayload("d4", { params: { id: docDetail[1] } });

  const shareByDoc = path.match(/^\/api\/shares\/doc\/(\d+)$/);
  if (method === "GET" && shareByDoc) return actionPayload("h2", { params: { docId: shareByDoc[1] } });
  const shareReview = path.match(/^\/api\/admin\/share-reviews\/(\d+)\/review$/);
  if (method === "POST" && shareReview) return actionPayload("h6", { params: { id: shareReview[1] }, body });
  if (method === "GET" && path === "/api/admin/share-reviews") return actionPayload("h5");
  const shareDetail = path.match(/^\/api\/shares\/(\d+)$/);
  if (method === "PATCH" && shareDetail) return actionPayload("h3", { params: { id: shareDetail[1] }, body });
  if (method === "DELETE" && shareDetail) return actionPayload("h4", { params: { id: shareDetail[1] } });

  if (method === "GET" && path === "/api/settings") return actionPayload("s1", { target: "settings" });
  if (method === "PATCH" && path === "/api/settings") return actionPayload("s2", { target: "settings", body });
  if (method === "GET" && path === "/api/settings/site") return actionPayload("s1", { target: "site" });
  if (method === "POST" && path === "/api/settings/site") return actionPayload("s2", { target: "site", body });
  if (method === "GET" && path === "/api/settings/storage/r2") return actionPayload("s1", { target: "r2" });
  if (method === "POST" && path === "/api/settings/storage/r2") return actionPayload("s2", { target: "r2", body });
  if (method === "POST" && path === "/api/settings/storage/r2/test") return actionPayload("s2", { target: "r2Test", body });
  if (method === "GET" && path === "/api/settings/operation-logs") return actionPayload("s1", { target: "logs" });

  if (method === "GET" && path === "/api/admin/users") return actionPayload("u1");
  const adminUserPromote = path.match(/^\/api\/admin\/users\/(\d+)\/promote$/);
  if (method === "POST" && adminUserPromote) return actionPayload("u3", { params: { id: adminUserPromote[1] } });
  const adminUserDisable = path.match(/^\/api\/admin\/users\/(\d+)\/disable$/);
  if (method === "POST" && adminUserDisable) return actionPayload("u4", { params: { id: adminUserDisable[1] } });
  const adminUserEnable = path.match(/^\/api\/admin\/users\/(\d+)\/enable$/);
  if (method === "POST" && adminUserEnable) return actionPayload("u5", { params: { id: adminUserEnable[1] } });
  const adminUser = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (method === "GET" && adminUser) return actionPayload("u2", { params: { id: adminUser[1] } });
  if (method === "DELETE" && adminUser) return actionPayload("u6", { params: { id: adminUser[1] } });

  if (method === "GET" && path === "/api/uploads/policy") return actionPayload("f1");
  if (method === "POST" && path === "/api/uploads/presign") return actionPayload("f2", { body });
  if (method === "POST" && path === "/api/uploads/complete") return actionPayload("f3", { body });
  const upload = path.match(/^\/api\/uploads\/(\d+)$/);
  if (method === "DELETE" && upload) return actionPayload("f4", { params: { id: upload[1] } });

  if (method === "GET" && path === "/api/spaces") return actionPayload("w1");
  if (method === "POST" && path === "/api/spaces") return actionPayload("w2", { body });
  const space = path.match(/^\/api\/spaces\/(\d+)$/);
  if (method === "PATCH" && space) return actionPayload("w3", { params: { id: space[1] }, body });
  if (method === "DELETE" && space) return actionPayload("w4", { params: { id: space[1] } });

  if (method === "GET" && path === "/api/admin/invites") return actionPayload("i1");
  if (method === "POST" && path === "/api/admin/invites") return actionPayload("i2", { body });
  if (method === "POST" && path === "/api/admin/invites/batch") return actionPayload("i3", { body });
  const inviteDisable = path.match(/^\/api\/admin\/invites\/(\d+)\/disable$/);
  if (method === "PATCH" && inviteDisable) return actionPayload("i4", { params: { id: inviteDisable[1] } });
  const invite = path.match(/^\/api\/admin\/invites\/(\d+)$/);
  if (method === "DELETE" && invite) return actionPayload("i5", { params: { id: invite[1] } });

  const dangerDoc = path.match(/^\/api\/admin\/docs\/by-id\/(\d+)$/);
  if (method === "GET" && dangerDoc) return actionPayload("x1", { params: { id: dangerDoc[1] } });
  if (method === "DELETE" && dangerDoc) return actionPayload("x2", { params: { id: dangerDoc[1] } });

  throw new Error(`Gateway action is not mapped for ${method} ${path}`);
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
  const action = resolveGatewayAction(url, method, parseBody(options.body));
  const packed = await packGatewayBody(action.payload, action.action);
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
