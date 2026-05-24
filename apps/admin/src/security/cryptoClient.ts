import { apiPaths } from "../api/endpoints";

interface PublicKeyResponse {
  keyId: string;
  publicKey: string;
}

interface ServerKeyBox {
  i: string;
  k: CryptoKey;
}

interface ChallengeView {
  nonce: string;
  issuedAt: number | string;
  expireAt: number | string;
  mode?: string;
}

interface ChallengeBox {
  v: ChallengeView;
  exp: number;
}

let p0: PublicKeyResponse | null = null;
let k0: ServerKeyBox | null = null;
let c0: ChallengeBox | null = null;
let c1 = 0;
const cKey = `__${word("chal", "lenge")}`;

function word(...parts: string[]) {
  return parts.join("");
}

function b2ab(v: string) {
  const b = atob(v);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i += 1) u[i] = b.charCodeAt(i);
  return u.buffer;
}

function ab2b(v: ArrayBuffer) {
  const u = new Uint8Array(v);
  let b = "";
  u.forEach((n) => {
    b += String.fromCharCode(n);
  });
  return btoa(b);
}

function p2ab(v: string) {
  return b2ab(v.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(/\s/g, ""));
}

function join(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, item) => n + item.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

async function iv0(key: Uint8Array, tag: string) {
  const a = new TextEncoder().encode("chendoc-aes-iv-v1");
  const b = new TextEncoder().encode(tag);
  const digest = await crypto.subtle.digest("SHA-256", join(a, b, key));
  return new Uint8Array(digest).slice(0, 12);
}

async function ak0(key: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, usages);
}

function readTime(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1_000_000_000_000 ? v * 1000 : v;
  if (typeof v === "string") {
    const asNumber = Number(v);
    if (Number.isFinite(asNumber)) return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    const asDate = Date.parse(v);
    if (Number.isFinite(asDate)) return asDate;
  }
  return 0;
}

function pickChallenge(input: unknown): ChallengeBox | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Partial<Record<keyof ChallengeView, unknown>>;
  if (typeof row.nonce !== "string" || !row.nonce) return null;
  const issuedAt = row.issuedAt;
  const expireAt = row.expireAt;
  const exp = readTime(expireAt);
  if (!exp || exp <= Date.now()) return null;
  return {
    v: {
      nonce: row.nonce,
      issuedAt: typeof issuedAt === "number" || typeof issuedAt === "string" ? issuedAt : Date.now(),
      expireAt: typeof expireAt === "number" || typeof expireAt === "string" ? expireAt : exp,
      mode: typeof row.mode === "string" ? row.mode : undefined
    },
    exp
  };
}

async function ch0(force = false) {
  if (!force && c0 && c0.exp - 5000 > Date.now()) return c0.v;
  if (!force && c1 > Date.now()) return null;

  try {
    const response = await fetch(apiPaths.proof(), { cache: "no-store" });
    if (!response.ok) {
      c1 = Date.now() + (response.status === 404 ? 5 * 60_000 : 60_000);
      return null;
    }

    const next = pickChallenge(await response.json());
    if (!next) {
      c1 = Date.now() + 10_000;
      return null;
    }

    c0 = next;
    return c0.v;
  } catch {
    c1 = Date.now() + 60_000;
    return null;
  }
}

function withNonce(data: unknown, c: ChallengeView | null) {
  if (!c || !data || typeof data !== "object" || Array.isArray(data)) return data;
  return {
    ...data as Record<string, unknown>,
    [cKey]: {
      nonce: c.nonce,
      issuedAt: c.issuedAt,
      mode: c.mode
    }
  };
}

async function sk0() {
  const response = p0 ?? await fetchServerKey();
  if (k0?.i === response.keyId) return k0;

  const imported = await crypto.subtle.importKey(
    "spki",
    p2ab(response[word("public", "Key") as "publicKey"]),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  p0 = response;
  k0 = { i: response.keyId, k: imported };
  return k0;
}

async function fetchServerKey() {
  const response = await fetch(apiPaths.serverKey());
  if (!response.ok) throw new Error("Failed to load crypto public key");
  return await response.json() as PublicKeyResponse;
}

async function ek0(value: string) {
  const box = await sk0();
  const out = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, box.k, new TextEncoder().encode(value));
  return { keyId: box.i, encryptedData: ab2b(out) };
}

export async function encryptRequest(data: unknown) {
  const scoped = withNonce(data, await ch0());

  const key = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = await ek0(ab2b(key.buffer));
  const aes = await ak0(key, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: await iv0(key, "request"), tagLength: 128 },
    aes,
    new TextEncoder().encode(JSON.stringify(scoped))
  );

  return { keyId: encryptedKey.keyId, key: encryptedKey.encryptedData, payload: ab2b(ciphertext) };
}
