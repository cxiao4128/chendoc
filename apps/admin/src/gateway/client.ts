import { resolveApiPath } from "../api/endpoints";
import { isGatewayActionCode, isGatewayExemptPath, type GatewayActionCode } from "../../../../server/src/gateway/action-registry";

const PACKET_VERSION = "xchen";
const REQUEST_PREFIX = "chendoc";
const RESPONSE_PREFIX = "XCHEN";

// Gateway 调试模式 - 仅开发时输出详细日志
const GATEWAY_DEBUG = import.meta.env.DEV && import.meta.env.VITE_DEBUG_GATEWAY === "true";

interface PublicKeyResponse {
  keyId: string;
  publicKey: string;
  expireAt: number | string;
  challenge?: ChallengeView;
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

interface ImportedServerKey {
  keyId: string;
  key: CryptoKey;
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
}

interface GatewayAction {
  action: GatewayActionCode;
  payload: Record<string, unknown>;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let publicKeyCache: PublicKeyResponse | null = null;
let importedKeyCache: ImportedServerKey | null = null;
let fingerprintCache: string | null = null;

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

async function fetchServerKey(action?: string) {
  const headers = new Headers();
  const query = action ? `?action=${encodeURIComponent(action)}` : "";
  if (action) headers.set("X-Client-Fingerprint", await clientFingerprint());

  const url = `/api/crypto/public-key${query}`;
  if (GATEWAY_DEBUG) console.log("[gateway] fetchServerKey:", url, "action:", action);
  const response = await fetch(url, {
    cache: "no-store",
    ...(action ? { headers } : {})
  });
  if (GATEWAY_DEBUG) console.log("[gateway] fetchServerKey response:", response.status, response.statusText);
  if (!response.ok) {
    const text = await response.text().catch(() => "N/A");
    console.error("[gateway] fetchServerKey error:", text);
    throw new Error(`Failed to load gateway public key: ${response.status} ${response.statusText}`);
  }
  return await response.json() as PublicKeyResponse;
}

function publicKeyUsable(key: PublicKeyResponse | null) {
  return !!key && readTime(key.expireAt) - Date.now() > 60_000;
}

async function importServerKey(response: PublicKeyResponse) {
  if (importedKeyCache?.keyId === response.keyId) {
    publicKeyCache = response;
    return importedKeyCache;
  }

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

async function serverKey() {
  const response = publicKeyUsable(publicKeyCache) ? publicKeyCache! : await fetchServerKey();
  return await importServerKey(response);
}

async function gatewayChallenge(action?: string) {
  const query = action ? `?action=${encodeURIComponent(action)}` : "";
  const response = await fetch(`/api/crypto/challenge${query}`, {
    cache: "no-store",
    headers: { "X-Client-Fingerprint": await clientFingerprint() }
  });
  if (!response.ok) throw new Error("Failed to load gateway challenge");
  const challenge = pickChallenge(await response.json());
  if (!challenge) throw new Error("Invalid gateway challenge");
  return challenge.value;
}

async function gatewayCryptoContext(action: string) {
  const response = await fetchServerKey(action);
  const keyBox = await importServerKey(response);
  const challenge = pickChallenge(response.challenge);
  if (challenge) {
    return { keyBox, challenge: challenge.value };
  }
  return { keyBox, challenge: await gatewayChallenge(action) };
}

async function clientFingerprint() {
  if (fingerprintCache) return fingerprintCache;
  const source = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  ].join("|");
  fingerprintCache = bytesToBase64url(await crypto.subtle.digest("SHA-256", textEncoder.encode(source)));
  return fingerprintCache;
}

async function importAesKey(key: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", Uint8Array.from(key).buffer, { name: "AES-GCM" }, false, usages);
}

async function encryptServerKey(value: string, serverKeyBox?: ImportedServerKey) {
  const keyBox = serverKeyBox ?? await serverKey();
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

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return undefined;
      seen.add(val);
      // 跳过 Vue 响应式对象内部属性
      if (typeof val.__v_isRef === "function") return (val as { value: unknown }).value;
      if (val instanceof Map || val instanceof Set) return undefined;
    }
    return val;
  });
}

async function encryptAesGcm(key: Uint8Array, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await importAesKey(key, ["encrypt"]);
  const body = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aes,
    textEncoder.encode(safeJsonStringify(value ?? {}))
  );
  return {
    iv: bytesToBase64url(iv),
    body: bytesToBase64url(body)
  };
}

async function hmacSha256(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", Uint8Array.from(key).buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64url(await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value)));
}

function signatureInput(input: { action: string; timestamp: number; nonce: string; body: string; challenge: string }) {
  return [input.action, String(input.timestamp), input.nonce, input.body, input.challenge].join("\n");
}

export async function packGatewayBody(body: unknown, action = "x0"): Promise<PackedGatewayBody> {
  const { envelope } = await packGatewayBodyWithKey(body, action);
  return { envelope };
}

async function packGatewayBodyWithKey(body: unknown, action = "x0"): Promise<PackedGatewayBody & { key: Uint8Array }> {
  const { keyBox, challenge } = await gatewayCryptoContext(action);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = await encryptServerKey(bytesToBase64(key), keyBox);
  const encryptedBody = await encryptAesGcm(key, body);
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const fingerprint = await clientFingerprint();

  const packet = {
    v: PACKET_VERSION,
    iv: encryptedBody.iv,
    challenge: challenge.nonce,
    timestamp,
    nonce,
    fingerprint,
    action,
    body: encryptedBody.body,
    signature: await hmacSha256(key, signatureInput({ action, timestamp, nonce, body: encryptedBody.body, challenge: challenge.nonce }))
  };

  const encryptedOuterKey = encryptedKey;
  const encryptedPacket = await encryptAesGcm(key, packet);

  return {
    envelope: {
      data: [
        REQUEST_PREFIX,
        encryptedOuterKey.keyId,
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
  if (!isGatewayActionCode(action)) throw new Error(`Unknown gateway action code: ${action}`);
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
  if (method === "POST" && path === "/api/auth/refresh") return actionPayload("a5");
  if (method === "POST" && path === "/api/auth/logout") return actionPayload("a6");

  if (method === "GET" && path === "/api/captcha") return actionPayload("c1");
  if (method === "GET" && path === "/api/public/settings/site") return actionPayload("p1");

  const publicSharePassword = path.match(/^\/api\/public\/r\/([^/]+)\/verify-password$/);
  if (method === "POST" && publicSharePassword) {
    return actionPayload("p2", { params: { shareKey: decodeURIComponent(publicSharePassword[1]) }, body });
  }
  const publicShare = path.match(/^\/api\/public\/r\/([^/]+)$/);
  if (method === "GET" && publicShare) {
    return actionPayload("p3", { params: { shareKey: decodeURIComponent(publicShare[1]) } });
  }

  if (method === "GET" && path === "/api/docs") return actionPayload("d1", { query });
  if (method === "GET" && path === "/api/docs/search") return actionPayload("d1", { query, mode: "search" });
  if (method === "POST" && path === "/api/docs") return actionPayload("d3", { body });
  if (method === "POST" && path === "/api/docs/bulk-delete") return actionPayload("d5", { body });

  if (method === "GET" && path === "/api/docs/trash") return actionPayload("r1", { query });
  if (method === "POST" && path === "/api/docs/trash/batch-restore") return actionPayload("r2", { body });
  if (method === "POST" && path === "/api/docs/trash/batch-delete") return actionPayload("r3", { body });
  if (method === "GET" && path === "/api/docs/trash/stats") return actionPayload("r4", {});
  if (method === "GET" && path === "/api/admin/docs/trash") return actionPayload("r1", { query, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-restore") return actionPayload("r2", { body, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-hard-delete") return actionPayload("r3", { body, scope: "admin" });

  const docVersionRestore = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions\/(\d+)\/restore$/);
  if (method === "POST" && docVersionRestore) {
    return actionPayload("d8", { params: { docUid: docVersionRestore[1], versionId: docVersionRestore[2] } });
  }
  const docVersions = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions$/);
  if (method === "GET" && docVersions) return actionPayload("d7", { params: { docUid: docVersions[1] } });
  const docPublish = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/publish$/);
  if (method === "POST" && docPublish) return actionPayload("d6", { params: { docUid: docPublish[1] } });
  const docShare = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/share$/);
  if (method === "POST" && docShare) return actionPayload("h1", { params: { docUid: docShare[1] }, body });
  const docDetail = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && docDetail) return actionPayload("d2", { params: { docUid: docDetail[1] } });
  if (method === "PATCH" && docDetail) return actionPayload("d3", { params: { docUid: docDetail[1] }, body });
  if (method === "DELETE" && docDetail) return actionPayload("d4", { params: { docUid: docDetail[1] } });

  const shareByDoc = path.match(/^\/api\/shares\/doc\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && shareByDoc) return actionPayload("h2", { params: { docUid: shareByDoc[1] } });
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
  if (method === "GET" && path === "/api/settings/system/status") return actionPayload("s1", { target: "systemStatus" });
  if (method === "GET" && path === "/api/settings/system/export") return actionPayload("s1", { target: "systemExport" });
  const systemAction = path.match(/^\/api\/settings\/system\/actions\/([^/]+)$/);
  if (method === "POST" && systemAction) {
    return actionPayload("s2", { target: "systemAction", params: { action: decodeURIComponent(systemAction[1]) } });
  }

  if (method === "GET" && path === "/api/admin/users") return actionPayload("u1");
  const adminUserPromote = path.match(/^\/api\/admin\/users\/(\d+)\/promote$/);
  if (method === "POST" && adminUserPromote) return actionPayload("u3", { params: { id: adminUserPromote[1] } });
  const adminUserDisable = path.match(/^\/api\/admin\/users\/(\d+)\/disable$/);
  if (method === "POST" && adminUserDisable) return actionPayload("u4", { params: { id: adminUserDisable[1] } });
  const adminUserEnable = path.match(/^\/api\/admin\/users\/(\d+)\/enable$/);
  if (method === "POST" && adminUserEnable) return actionPayload("u5", { params: { id: adminUserEnable[1] } });
  const adminUserPassword = path.match(/^\/api\/admin\/users\/(\d+)\/password$/);
  if (method === "GET" && adminUserPassword) return actionPayload("u7", { params: { id: adminUserPassword[1] } });
  if (method === "POST" && adminUserPassword) return actionPayload("u8", { params: { id: adminUserPassword[1] }, body });
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

  if (method === "GET" && path === "/api/forms") return actionPayload("fm1");
  if (method === "POST" && path === "/api/forms") return actionPayload("fm2", { body });
  const formDetail = path.match(/^\/api\/forms\/(\d+)$/);
  if (method === "GET" && formDetail) return actionPayload("fm3", { params: { id: formDetail[1] } });
  if (method === "PUT" && formDetail) return actionPayload("fm4", { params: { id: formDetail[1] }, body });
  if (method === "DELETE" && formDetail) return actionPayload("fm5", { params: { id: formDetail[1] } });
  const formPublish = path.match(/^\/api\/forms\/(\d+)\/publish$/);
  if (method === "POST" && formPublish) return actionPayload("fm6", { params: { id: formPublish[1] }, body });
  const formSubmissions = path.match(/^\/api\/forms\/(\d+)\/submissions$/);
  if (method === "GET" && formSubmissions) return actionPayload("fm7", { params: { id: formSubmissions[1] }, query });
  if (method === "DELETE" && formSubmissions) return actionPayload("fm10", { params: { id: formSubmissions[1] } });
  const formSubmission = path.match(/^\/api\/forms\/(\d+)\/submissions\/(\d+)$/);
  if (method === "DELETE" && formSubmission) return actionPayload("fm11", { params: { id: formSubmission[1], submissionId: formSubmission[2] } });
  const formExport = path.match(/^\/api\/forms\/(\d+)\/export$/);
  if (method === "GET" && formExport) return actionPayload("fm8", { params: { id: formExport[1] }, query });
  const formIpStats = path.match(/^\/api\/forms\/(\d+)\/ip-stats$/);
  if (method === "GET" && formIpStats) return actionPayload("fm9", { params: { id: formIpStats[1] } });

  if (method === "GET" && path === "/api/admin/invites") return actionPayload("i1");
  if (method === "POST" && path === "/api/admin/invites") return actionPayload("i2", { body });
  if (method === "POST" && path === "/api/admin/invites/batch") return actionPayload("i3", { body });
  const inviteDisable = path.match(/^\/api\/admin\/invites\/(\d+)\/disable$/);
  if (method === "PATCH" && inviteDisable) return actionPayload("i4", { params: { id: inviteDisable[1] } });
  const invite = path.match(/^\/api\/admin\/invites\/(\d+)$/);
  if (method === "DELETE" && invite) return actionPayload("i5", { params: { id: invite[1] } });

  const dangerDoc = path.match(/^\/api\/admin\/docs\/by-uid\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && dangerDoc) return actionPayload("x1", { params: { docUid: dangerDoc[1] } });
  if (method === "DELETE" && dangerDoc) return actionPayload("x2", { params: { docUid: dangerDoc[1] } });

  if (method === "GET" && path === "/api/admin/security/totp/status") return actionPayload("y1");
  if (method === "POST" && path === "/api/admin/security/totp/setup") return actionPayload("y2");
  if (method === "POST" && path === "/api/admin/security/totp/enable") return actionPayload("y3", { body });
  if (method === "POST" && path === "/api/admin/security/totp/disable") return actionPayload("y4", { body });
  if (method === "POST" && path === "/api/admin/security/totp/recovery-codes") return actionPayload("y6", { body });
  if (method === "POST" && path === "/api/admin/security/totp/reset") return actionPayload("y7", { body });
  if (method === "POST" && (path === "/api/admin/security/danger-verify" || path === "/api/security/danger-verify")) return actionPayload("y8", { body });

  throw new Error(`Gateway action is not mapped for ${method} ${path}`);
}

export function shouldUseGateway(url: string, body?: BodyInit | null) {
  if (packetLayerDisabled) return false;
  if (body instanceof FormData) return false;
  const path = resolveApiPath(url);
  return path.startsWith("/api/")
    && !isGatewayExemptPath(path);
}

export async function gatewayClientRequest<T>(url: string, options: RequestInit, headers: Headers) {
  const method = (options.method || "GET").toUpperCase();
  const action = resolveGatewayAction(url, method, parseBody(options.body));
  const { envelope, key } = await packGatewayBodyWithKey(action.payload, action.action);
  const gatewayHeaders = new Headers(headers);
  gatewayHeaders.set("Content-Type", "application/json");
  gatewayHeaders.set("X-Client-Fingerprint", await clientFingerprint());

  const response = await fetch("/api/gateway", {
    ...options,
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify(envelope)
  });
  const contentType = response.headers.get("Content-Type") || "";
  const rawPayload = contentType.includes("application/json") ? await response.json() : await response.text();
  const payload = await decryptGatewayResponse<T>(rawPayload, key);
  return { response, payload };
}
