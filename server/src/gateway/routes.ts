import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

const transportSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(5).max(2048),
  body: z.unknown().optional()
});

function normalizeGatewayPath(path: string) {
  if (!path.startsWith("/api/") || path.startsWith("/api/gateway")) {
    throw new Error("Invalid gateway target.");
  }
  const url = new URL(path, "http://chendoc.local");
  if (url.origin !== "http://chendoc.local" || !url.pathname.startsWith("/api/")) {
    throw new Error("Invalid gateway target.");
  }
  return `${url.pathname}${url.search}`;
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function internalHeaders(request: FastifyRequest) {
  const headers: Record<string, string> = {
    "x-gateway-internal": "1",
    "x-forwarded-for": request.ip
  };

  for (const name of ["authorization", "user-agent", "x-client-risk"]) {
    const value = headerValue(request, name);
    if (value) headers[name] = value;
  }

  return headers;
}

function parseInjectedPayload(payload: string, contentType: string | undefined) {
  if (!payload) return null;
  if (!contentType?.includes("application/json")) return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

export async function gatewayRoutes(app: FastifyInstance) {
  app.post("/api/gateway", async (request, reply) => {
    const transport = transportSchema.parse(request.body);
    const method = transport.method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    const url = normalizeGatewayPath(transport.path);
    const hasBody = method !== "GET" && method !== "DELETE";

    const response = await app.inject({
      method,
      url,
      headers: {
        ...internalHeaders(request),
        ...(hasBody ? { "content-type": "application/json" } : {})
      },
      payload: hasBody ? JSON.stringify(transport.body ?? {}) : undefined
    });

    const contentType = Array.isArray(response.headers["content-type"])
      ? response.headers["content-type"][0]
      : response.headers["content-type"];

    return reply
      .code(response.statusCode)
      .send(parseInjectedPayload(response.body, contentType));
  });
}
