type AbortSignalConstructorWithHelpers = typeof AbortSignal & {
  any?: (signals: AbortSignal[]) => AbortSignal;
  timeout?: (milliseconds: number) => AbortSignal;
};

type GatewayCryptoEnvironment = {
  isSecureContext?: boolean;
  crypto?: Pick<Crypto, "subtle">;
};

export const WEB_CRYPTO_UNAVAILABLE = "WEB_CRYPTO_UNAVAILABLE";

export function hasGatewayWebCrypto(environment: GatewayCryptoEnvironment = globalThis) {
  return environment.isSecureContext !== false && !!environment.crypto?.subtle;
}

export function requireGatewayWebCrypto(environment: GatewayCryptoEnvironment = globalThis) {
  if (hasGatewayWebCrypto(environment)) return;
  throw Object.assign(new Error("当前地址不支持安全请求，请使用 HTTPS 地址。"), {
    code: WEB_CRYPTO_UNAVAILABLE
  });
}

export function timeoutSignal(milliseconds: number) {
  const helpers = AbortSignal as AbortSignalConstructorWithHelpers;
  if (typeof helpers.timeout === "function") return helpers.timeout(milliseconds);

  const controller = new AbortController();
  globalThis.setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

export function combineAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) return signals[0];

  const helpers = AbortSignal as AbortSignalConstructorWithHelpers;
  if (typeof helpers.any === "function") return helpers.any(signals);

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

export function secureRandomUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join("")
  ].join("-");
}
