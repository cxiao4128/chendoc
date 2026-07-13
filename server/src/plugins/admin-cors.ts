import type { FastifyInstance, FastifyReply } from "fastify";

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const ALLOWED_HEADERS = new Set([
  "accept",
  "authorization",
  "cache-control",
  "content-type",
  "pragma",
  "x-client-fingerprint",
  "x-client-risk",
]);

function addCorsHeaders(reply: FastifyReply, origin: string, preflight = false) {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Credentials", "true");
  reply.header("Cross-Origin-Resource-Policy", "cross-origin");
  reply.header("Vary", preflight
    ? "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
    : "Origin");
  if (!preflight) return;
  reply.header("Access-Control-Allow-Methods", [...ALLOWED_METHODS].join(", "));
  reply.header("Access-Control-Allow-Headers", [...ALLOWED_HEADERS].join(", "));
  reply.header("Access-Control-Max-Age", "600");
}

function requestedHeaders(value: string | undefined) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function registerAdminCors(app: FastifyInstance, origins: readonly string[]) {
  const allowedOrigins = new Set(origins);

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const origin = request.headers.origin;
    if (!origin) return;
    const requestOrigin = request.headers.host ? `${request.protocol}://${request.headers.host}` : "";
    if (origin === "null" || (!allowedOrigins.has(origin) && origin !== requestOrigin)) {
      return reply.code(403).send({ code: "ORIGIN_NOT_ALLOWED", message: "请求来源未获授权" });
    }

    const preflight = request.method === "OPTIONS";
    addCorsHeaders(reply, origin, preflight);
    if (!preflight) return;

    const requestedMethod = request.headers["access-control-request-method"]?.toUpperCase();
    const headers = requestedHeaders(request.headers["access-control-request-headers"]);
    if (!requestedMethod || !ALLOWED_METHODS.has(requestedMethod) || headers.some((name) => !ALLOWED_HEADERS.has(name))) {
      return reply.code(400).send({ code: "INVALID_PREFLIGHT", message: "跨域预检参数无效" });
    }
    return reply.code(204).send();
  });
}
