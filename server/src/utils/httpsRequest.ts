type ForwardedProto = string | string[] | undefined;

function firstForwardedProto(value: ForwardedProto) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",", 1)[0]?.trim().toLowerCase() || "";
}

export function isLoopbackAddress(address: string | undefined) {
  const normalized = (address || "").trim().toLowerCase();
  if (normalized === "::1") return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  return /^127(?:\.\d{1,3}){3}$/.test(ipv4);
}

export function httpsRedirectOrigin(input: {
  requestUrl: string;
  publicSiteUrl: string;
  apiOrigin: string;
}) {
  const pathname = new URL(input.requestUrl, "http://localhost").pathname;
  return pathname.startsWith("/api/")
    ? new URL(input.apiOrigin).origin
    : new URL(input.publicSiteUrl).origin;
}

export function isHttpsRequest(input: {
  protocol: string;
  forwardedProto: ForwardedProto;
  remoteAddress: string | undefined;
  publicSiteUrl: string;
}) {
  if (input.protocol.trim().toLowerCase() === "https") return true;
  if (!isLoopbackAddress(input.remoteAddress)) return false;

  const forwardedProto = firstForwardedProto(input.forwardedProto);
  if (forwardedProto) return forwardedProto === "https";

  try {
    return new URL(input.publicSiteUrl).protocol === "https:";
  } catch {
    return false;
  }
}
