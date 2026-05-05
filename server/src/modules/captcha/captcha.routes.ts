import type { FastifyInstance } from "fastify";
import { createCaptcha } from "./captcha.service.js";

export async function captchaRoutes(app: FastifyInstance) {
  app.get("/api/captcha", async () => createCaptcha());
}
