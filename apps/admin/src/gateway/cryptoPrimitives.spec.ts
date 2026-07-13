import { createHmac, hkdfSync, webcrypto } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hmacSha256, signatureInput } from "./cryptoPrimitives";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway signature", () => {
  test("matches the server HKDF + HMAC derivation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const input = signatureInput({
      action: "a1",
      timestamp: 1_783_666_900_000,
      nonce: "11111111-2222-4333-8444-555555555555",
      body: "encrypted-body",
      challenge: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    });

    const derived = Buffer.from(hkdfSync(
      "sha256",
      Buffer.from(key),
      Buffer.alloc(0),
      "chendoc-signature",
      32
    ));
    const expected = createHmac("sha256", derived).update(input).digest("base64url");

    await expect(hmacSha256(key, input)).resolves.toBe(expected);
  });
});
