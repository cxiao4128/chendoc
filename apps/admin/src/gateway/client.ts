import { resolveApiPath } from "../api/endpoints";
import { isGatewayExemptPath } from "../../../../server/src/gateway/action-registry";
import { parseBody } from "./actionPayload";
import { resolveGatewayAction } from "./actions";
import { packetLayerDisabled } from "./constants";
import { clientFingerprint } from "./serverKey";
import { decryptGatewayResponse, packGatewayBodyWithKey } from "./packet";
import { combineAbortSignals, requireGatewayWebCrypto, timeoutSignal } from "./webCompat";
import { backendFetch } from "../config/runtime";

export { packetLayerDisabled } from "./constants";
export { packGatewayBody } from "./packet";

export function shouldUseGateway(url: string, body?: BodyInit | null) {
  if (packetLayerDisabled) return false;
  if (body instanceof FormData) return false;
  const path = resolveApiPath(url);
  return path.startsWith("/api/")
    && !isGatewayExemptPath(path);
}

export async function gatewayClientRequest<T>(url: string, options: RequestInit, headers: Headers) {
  requireGatewayWebCrypto();
  const method = (options.method || "GET").toUpperCase();
  const action = resolveGatewayAction(url, method, parseBody(options.body));
  const { envelope, key } = await packGatewayBodyWithKey(action.payload, action.action);
  const gatewayHeaders = new Headers(headers);
  gatewayHeaders.set("Content-Type", "application/json");
  gatewayHeaders.set("X-Client-Fingerprint", await clientFingerprint());

  const requestTimeoutSignal = timeoutSignal(30000);
  const signal = options.signal
    ? combineAbortSignals([options.signal, requestTimeoutSignal])
    : requestTimeoutSignal;
  const response = await backendFetch("/api/gateway", {
    ...options,
    method: "POST",
    headers: gatewayHeaders,
    body: JSON.stringify(envelope),
    signal
  });
  const contentType = response.headers.get("Content-Type") || "";
  const rawPayload = contentType.includes("application/json") ? await response.json() : await response.text();
  const payload = await decryptGatewayResponse<T>(rawPayload, key);
  return { response, payload };
}
