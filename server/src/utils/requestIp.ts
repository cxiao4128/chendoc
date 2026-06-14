import type { FastifyRequest } from "fastify";

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : "";
}

function normalizeIp(value: string) {
  let ip = value.trim().replace(/^"|"$/g, "");
  if (!ip) return "";
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > 0 ? ip.indexOf("]") : undefined);
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  return ip;
}

function firstForwardedFor(value: string) {
  return normalizeIp(value.split(",").map((item) => item.trim()).find(Boolean) || "");
}

function forwardedHeaderIp(value: string) {
  const first = value.split(",").map((item) => item.trim()).find(Boolean) || "";
  const match = first.match(/(?:^|;)\s*for=([^;]+)/i);
  return match ? normalizeIp(match[1] || "") : "";
}

function isLocalProxyIp(value: string) {
  return value === "127.0.0.1"
    || value === "::1"
    || value === "localhost"
    || value.startsWith("10.")
    || value.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

export function clientIpFromRequest(request: FastifyRequest) {
  const requestIp = normalizeIp(request.ip || "");
  const forwardedIp = firstForwardedFor(headerValue(request, "x-forwarded-for"))
    || normalizeIp(headerValue(request, "x-real-ip"))
    || normalizeIp(headerValue(request, "cf-connecting-ip"))
    || forwardedHeaderIp(headerValue(request, "forwarded"));

  if (request.headers["x-gateway-internal"] === "1") return forwardedIp || requestIp;
  if (Array.isArray(request.ips) && request.ips.length) return normalizeIp(request.ips[0] || "") || forwardedIp || requestIp;
  if (requestIp && isLocalProxyIp(requestIp)) return forwardedIp || requestIp;
  return requestIp || forwardedIp || "";
}
