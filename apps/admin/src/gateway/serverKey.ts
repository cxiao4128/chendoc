import { bytesToBase64url, pemToBuffer } from "./base64";
import { pickChallenge, readTime } from "./challenge";
import { GATEWAY_DEBUG, textEncoder } from "./constants";
import type { ImportedServerKey, PublicKeyResponse } from "./types";
import { timeoutSignal } from "./webCompat";
import { backendFetch } from "../config/runtime";

let publicKeyCache: PublicKeyResponse | null = null;
let importedKeyCache: ImportedServerKey | null = null;
let fingerprintCache: string | null = null;

export async function fetchServerKey(action?: string) {
  const headers = new Headers();
  const query = action ? `?action=${encodeURIComponent(action)}` : "";
  if (action) headers.set("X-Client-Fingerprint", await clientFingerprint());

  const url = `/api/crypto/public-key${query}`;
  if (GATEWAY_DEBUG) console.log("[gateway] fetchServerKey:", url, "action:", action);
  const response = await backendFetch(url, {
    cache: "no-store",
    signal: timeoutSignal(30000),
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

export function publicKeyUsable(key: PublicKeyResponse | null) {
  return !!key && readTime(key.expireAt) - Date.now() > 60_000;
}

export async function importServerKey(response: PublicKeyResponse) {
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

export async function serverKey() {
  const response = publicKeyUsable(publicKeyCache) ? publicKeyCache! : await fetchServerKey();
  return await importServerKey(response);
}

export async function gatewayChallenge(action?: string) {
  const query = action ? `?action=${encodeURIComponent(action)}` : "";
  const response = await backendFetch(`/api/crypto/challenge${query}`, {
    cache: "no-store",
    headers: { "X-Client-Fingerprint": await clientFingerprint() }
  });
  if (!response.ok) throw new Error("Failed to load gateway challenge");
  const challenge = pickChallenge(await response.json());
  if (!challenge) throw new Error("Invalid gateway challenge");
  return challenge.value;
}

export async function gatewayCryptoContext(action: string) {
  const response = await fetchServerKey(action);
  const keyBox = await importServerKey(response);
  const challenge = pickChallenge(response.challenge);
  return { keyBox, challenge: challenge ? challenge.value : await gatewayChallenge(action) };
}

export async function clientFingerprint() {
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

export async function encryptServerKey(value: string, serverKeyBox?: ImportedServerKey) {
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
