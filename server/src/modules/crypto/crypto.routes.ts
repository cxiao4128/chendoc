import type { FastifyInstance } from "fastify";
import { issueGatewayChallenge } from "../../gateway/packet.js";
import { getActivePublicKey } from "./crypto.service.js";

export async function cryptoRoutes(app: FastifyInstance) {
  app.get("/api/crypto/public-key", async () => getActivePublicKey());
  app.get("/api/crypto/challenge", async () => issueGatewayChallenge());
}
