import { base64urlToBytes, bytesToBase64 } from "./base64";
import { PACKET_VERSION, REQUEST_PREFIX, RESPONSE_PREFIX, textDecoder } from "./constants";
import { encryptAesGcm, hmacSha256, importAesKey, signatureInput } from "./cryptoPrimitives";
import { clientFingerprint, encryptServerKey, gatewayCryptoContext } from "./serverKey";
import type { GatewayResponsePacket, PackedGatewayBody } from "./types";
import { secureRandomUuid } from "./webCompat";

export async function packGatewayBody(body: unknown, action = "x0"): Promise<PackedGatewayBody> {
  const { envelope } = await packGatewayBodyWithKey(body, action);
  return { envelope };
}

export async function packGatewayBodyWithKey(body: unknown, action = "x0"): Promise<PackedGatewayBody & { key: Uint8Array }> {
  const { keyBox, challenge } = await gatewayCryptoContext(action);
  const key = crypto.getRandomValues(new Uint8Array(32));
  const encryptedKey = await encryptServerKey(bytesToBase64(key), keyBox);
  const encryptedBody = await encryptAesGcm(key, body);
  const timestamp = Date.now();
  const nonce = secureRandomUuid();
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
  const encryptedPacket = await encryptAesGcm(key, packet);

  return {
    envelope: {
      data: [
        REQUEST_PREFIX,
        encryptedKey.keyId,
        encryptedKey.key,
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

export async function decryptGatewayResponse<T>(input: unknown, key: Uint8Array) {
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
