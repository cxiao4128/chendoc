import { bytesToBase64url } from "./base64";
import { textEncoder } from "./constants";

export async function importAesKey(key: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", Uint8Array.from(key).buffer, { name: "AES-GCM" }, false, usages);
}

export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return undefined;
      seen.add(val);
      if (typeof val.__v_isRef === "function") return (val as { value: unknown }).value;
      if (val instanceof Map || val instanceof Set) return undefined;
    }
    return val;
  });
}

export async function encryptAesGcm(key: Uint8Array, value: unknown) {
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

export async function hmacSha256(key: Uint8Array, value: string) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(key).buffer,
    "HKDF",
    false,
    ["deriveBits"]
  );
  const signatureKey = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(0),
    info: textEncoder.encode("chendoc-signature")
  }, keyMaterial, 256);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    signatureKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToBase64url(await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value)));
}

export function signatureInput(input: { action: string; timestamp: number; nonce: string; body: string; challenge: string }) {
  return [input.action, String(input.timestamp), input.nonce, input.body, input.challenge].join("\n");
}
