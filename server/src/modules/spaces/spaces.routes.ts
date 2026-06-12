import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { createSpace, deleteSpace, listSpaces, updateSpace } from "./spaces.service.js";

export async function spacesRoutes(app: FastifyInstance) {
  app.get("/api/spaces", { preHandler: authenticate }, async (request) => ({ spaces: await listSpaces(request.user!) }));
  app.post("/api/spaces", { preHandler: authenticate }, async (request) => createSpace(request.user!.id, request.body));
  app.patch("/api/spaces/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await updateSpace(params.id, request.body, request.user!);
    return { ok: true };
  });
  app.delete("/api/spaces/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await deleteSpace(params.id, request.user!);
    return { ok: true };
  });
}
