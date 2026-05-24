export interface ResponseDecryptor {
  publicKeyHeader: string;
  decrypt<T>(encryptedData: string): Promise<T>;
}

interface EncryptedResponseEnvelope {
  alg: "RSA-OAEP-256+A256GCM";
  key: string;
  data: string;
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

function pem(v: ArrayBuffer) {
  const b = ab2b(v);
  const body = b.match(/.{1,64}/g)?.join("\n") || b;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function txt(v: string) {
  return new TextDecoder().decode(b2ab(v));
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

export async function createResponseDecryptor(): Promise<ResponseDecryptor> {
  const kp = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
  const pub = await crypto.subtle.exportKey("spki", kp.publicKey);

  return {
    publicKeyHeader: btoa(pem(pub)),
    async decrypt<T>(encryptedData: string) {
      const envelope = JSON.parse(txt(encryptedData)) as EncryptedResponseEnvelope;
      const keyBase64 = new TextDecoder().decode(await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        kp.privateKey,
        b2ab(envelope.key)
      ));
      const key = new Uint8Array(b2ab(keyBase64));
      const aes = await ak0(key, ["decrypt"]);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: await iv0(key, "response"), tagLength: 128 },
        aes,
        b2ab(envelope.data)
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    }
  };
}

export function isEncryptedResponse(payload: unknown): payload is { encryptedData: string } {
  return typeof payload === "object"
    && payload !== null
    && "encryptedData" in payload
    && typeof (payload as { encryptedData?: unknown }).encryptedData === "string";
}
