import { describe, expect, it } from "vitest";
import {
  combineAbortSignals,
  hasGatewayWebCrypto,
  requireGatewayWebCrypto,
  secureRandomUuid,
  timeoutSignal,
  WEB_CRYPTO_UNAVAILABLE
} from "./webCompat";

describe("gateway Web Crypto capability", () => {
  const subtle = {} as SubtleCrypto;

  it("accepts a secure context with SubtleCrypto", () => {
    expect(hasGatewayWebCrypto({ isSecureContext: true, crypto: { subtle } })).toBe(true);
  });

  it("rejects an insecure context even when SubtleCrypto is exposed", () => {
    expect(hasGatewayWebCrypto({ isSecureContext: false, crypto: { subtle } })).toBe(false);
  });

  it("throws a stable error code instead of a browser TypeError", () => {
    expect(() => requireGatewayWebCrypto({ isSecureContext: false, crypto: undefined })).toThrowError(
      expect.objectContaining({ code: WEB_CRYPTO_UNAVAILABLE })
    );
  });
});

describe("gateway web compatibility", () => {
  it("creates RFC 4122 version 4 nonces", () => {
    expect(secureRandomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("combines cancellation signals", () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineAbortSignals([first.signal, second.signal]);
    second.abort();
    expect(combined.aborted).toBe(true);
  });

  it("creates timeout signals", async () => {
    const signal = timeoutSignal(1);
    if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    expect(signal.aborted).toBe(true);
  });
});
