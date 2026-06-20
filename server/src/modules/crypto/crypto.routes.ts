import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { issueGatewayChallenge } from "../../gateway/packet.js";
import { getActivePublicKey } from "./crypto.service.js";

const challengeQuerySchema = z.object({ action: z.string().regex(/^[a-z]+[0-9]+$/i).optional() });

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestChallenge(request: FastifyRequest, fingerprint: string, action?: string) {
  return issueGatewayChallenge({
    ip: request.ip,
    userAgent: request.headers["user-agent"],
    fingerprint,
    action
  });
}

export async function cryptoRoutes(app: FastifyInstance) {
  app.get("/api/crypto/public-key", async (request) => {
    const query = challengeQuerySchema.parse(request.query);
    const publicKey = await getActivePublicKey();
    const fingerprint = headerValue(request, "x-client-fingerprint");
    if (!fingerprint || !query.action) return publicKey;
    return {
      ...publicKey,
      challenge: requestChallenge(request, fingerprint, query.action)
    };
  });

  app.get("/api/crypto/challenge", async (request, reply) => {
    const query = challengeQuerySchema.parse(request.query);
    const fingerprint = headerValue(request, "x-client-fingerprint");
    if (!fingerprint) return reply.code(400).send({ code: "INVALID_CHALLENGE", message: "Invalid gateway challenge." });
    return requestChallenge(request, fingerprint, query.action);
  });
}
