interface AuthSession {
  sessionId: string;
  sessionKey: string;
  expireAt: number;
}

export const AUTH_SESSION_STORAGE_KEY = "chendoc_auth_session";

const PERSISTED_SESSION_MS = 2 * 60 * 60 * 1000;
let s0: AuthSession | null = null;

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

function ab2u(v: ArrayBuffer) {
  return ab2b(v).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function idBytes(id: string) {
  const hex = id.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function ak0(key: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, usages);
}

async function iv0(key: Uint8Array, id: string, nonce: Uint8Array) {
  const a = new TextEncoder().encode("chendoc-auth-iv-v1");
  const b = new TextEncoder().encode(id);
  const digest = await crypto.subtle.digest("SHA-256", join(a, b, nonce, key));
  return new Uint8Array(digest).slice(0, 12);
}

function validSession(input: unknown): input is AuthSession {
  if (!input || typeof input !== "object") return false;
  const item = input as Partial<AuthSession>;
  return typeof item.sessionId === "string"
    && typeof item.sessionKey === "string"
    && typeof item.expireAt === "number"
    && item.expireAt > Date.now();
}

function loadSession() {
  if (s0) return s0;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as unknown;
    if (!validSession(stored)) {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    s0 = stored;
    return s0;
  } catch {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSession(sessionId: string, sessionKey: string) {
  s0 = { sessionId, sessionKey, expireAt: Date.now() + PERSISTED_SESSION_MS };
  try {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(s0));
  } catch {
    // Keep the in-memory session if persistent storage is unavailable.
  }
}

export function clearAuthSession() {
  s0 = null;
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function getSessionId() {
  return loadSession()?.sessionId || "";
}

export async function buildAuthorization() {
  const session = loadSession();
  if (!session) return "";

  const key = new Uint8Array(b2ab(session.sessionKey));
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const aes = await ak0(key, ["encrypt"]);
  const payload = {
    sid: session.sessionId,
    t: Date.now()
  };
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: await iv0(key, session.sessionId, nonce), tagLength: 128 },
    aes,
    new TextEncoder().encode(JSON.stringify(payload))
  );

  return ab2u(join(new Uint8Array([1]), idBytes(session.sessionId), nonce, new Uint8Array(ciphertext)).buffer);
}
