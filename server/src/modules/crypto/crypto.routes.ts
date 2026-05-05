import type { FastifyInstance } from "fastify";
import { getActivePublicKey } from "./crypto.service.js";

export async function cryptoRoutes(app: FastifyInstance) {
  app.get("/api/crypto/public-key", async () => getActivePublicKey());
}
