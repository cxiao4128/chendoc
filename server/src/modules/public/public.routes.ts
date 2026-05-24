import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { renderSharePage } from "./public.service.js";

export async function publicRoutes(app: FastifyInstance) {
  app.get("/r/:shareKey", async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const query = z.object({ accessToken: z.string().optional() }).parse(request.query);
    const page = await renderSharePage(params.shareKey, query.accessToken);
    return reply.code(page.statusCode).type("text/html; charset=utf-8").send(page.html);
  });
}
