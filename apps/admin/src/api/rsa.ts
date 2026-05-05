import { fetchPublicKey, type PublicKeyResponse } from "./crypto";

interface CachedServerKey {
  keyId: string;
  publicKey: CryptoKey;
}

interface AuthSession {
  sessionId: string;
  sessionKey: string;
}

export interface ResponseDecryptor {
  publicKeyHeader: string;
  decrypt<T>(encryptedData: string): Promise<T>;
}

interface EncryptedResponseEnvelope {
  alg: "RSA-OAEP-256+A256GCM";
  key: string;
  data: string;
}

let cachedPublicKeyResponse: PublicKeyResponse | null = null;
let cachedServerKey: CachedServerKey | null = null;
let authSession: AuthSession | null = null;

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  return base64ToArrayBuffer(base64);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  return arrayBufferToBase64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function uuidToBytes(uuid: string) {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function arrayBufferToPublicPem(buffer: ArrayBuffer) {
  const base64 = arrayBufferToBase64(buffer);
  const body = base64.match(/.{1,64}/g)?.join("\n") || base64;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function base64ToText(base64: string) {
  return new TextDecoder().decode(base64ToArrayBuffer(base64));
}

function concatBytes(...parts: Uint8Array[]) {
  const length = parts.reduce((sum, item) => sum + item.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });
  return bytes;
}

async function deriveIv(keyBytes: Uint8Array, label: string) {
  const prefix = new TextEncoder().encode("chendoc-aes-iv-v1");
  const labelBytes = new TextEncoder().encode(label);
  const digest = await crypto.subtle.digest("SHA-256", concatBytes(prefix, labelBytes, keyBytes));
  return new Uint8Array(digest).slice(0, 12);
}

async function deriveAuthIv(keyBytes: Uint8Array, sessionId: string, nonce: Uint8Array) {
  const prefix = new TextEncoder().encode("chendoc-auth-iv-v1");
  const sessionBytes = new TextEncoder().encode(sessionId);
  const digest = await crypto.subtle.digest("SHA-256", concatBytes(prefix, sessionBytes, nonce, keyBytes));
  return new Uint8Array(digest).slice(0, 12);
}

async function importAesKey(keyBytes: Uint8Array, usages: KeyUsage[]) {
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    usages
  );
}

async function getServerKey() {
  const response = cachedPublicKeyResponse ?? await fetchPublicKey();
  if (cachedServerKey?.keyId === response.keyId) return cachedServerKey;

  const publicKey = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(response.publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  cachedPublicKeyResponse = response;
  cachedServerKey = { keyId: response.keyId, publicKey };
  return cachedServerKey;
}

export async function encryptWithServerPublicKey(value: string) {
  const serverKey = await getServerKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    serverKey.publicKey,
    new TextEncoder().encode(value)
  );
  return { keyId: serverKey.keyId, encryptedData: arrayBufferToBase64(ciphertext) };
}

export async function createEncryptedPayload(payload: unknown) {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = await encryptWithServerPublicKey(arrayBufferToBase64(keyBytes.buffer));
  const aesKey = await importAesKey(keyBytes, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: await deriveIv(keyBytes, "request"), tagLength: 128 },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return { keyId: encryptedKey.keyId, key: encryptedKey.encryptedData, payload: arrayBufferToBase64(ciphertext) };
}

export function setAuthSession(sessionId: string, sessionKey: string) {
  authSession = { sessionId, sessionKey };
}

export function clearAuthSession() {
  authSession = null;
}

export function getSessionId() {
  return authSession?.sessionId || "";
}

export async function createEncryptedAuthorization() {
  if (!authSession) return "";

  const keyBytes = new Uint8Array(base64ToArrayBuffer(authSession.sessionKey));
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await importAesKey(keyBytes, ["encrypt"]);
  const payload = {
    sid: authSession.sessionId,
    t: Date.now()
  };
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: await deriveAuthIv(keyBytes, authSession.sessionId, nonce), tagLength: 128 },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const packed = concatBytes(
    new Uint8Array([1]),
    uuidToBytes(authSession.sessionId),
    nonce,
    new Uint8Array(ciphertext)
  );
  return arrayBufferToBase64Url(packed.buffer);
}

export async function createResponseDecryptor(): Promise<ResponseDecryptor> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyPem = arrayBufferToPublicPem(publicKeyDer);

  return {
    publicKeyHeader: btoa(publicKeyPem),
    async decrypt<T>(encryptedData: string) {
      const envelope = JSON.parse(base64ToText(encryptedData)) as EncryptedResponseEnvelope;
      const keyBase64 = new TextDecoder().decode(await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        keyPair.privateKey,
        base64ToArrayBuffer(envelope.key)
      ));
      const keyBytes = new Uint8Array(base64ToArrayBuffer(keyBase64));
      const aesKey = await importAesKey(keyBytes, ["decrypt"]);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: await deriveIv(keyBytes, "response"), tagLength: 128 },
        aesKey,
        base64ToArrayBuffer(envelope.data)
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    }
  };
}

export function isEncryptedResponse(payload: unknown): payload is { encryptedData: string } {
  return typeof payload === "object" && payload !== null && "encryptedData" in payload && typeof (payload as { encryptedData?: unknown }).encryptedData === "string";
}
