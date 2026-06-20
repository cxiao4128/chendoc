import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { renderFormPage } from "./forms.public.js";
import { submitForm } from "./forms.service.js";
import { clientIpFromRequest } from "../../utils/requestIp.js";

const SUBMITTER_COOKIE = "chendoc_form_submitter";

function submitterIdentity(request: { headers: { cookie?: string }; protocol?: string }, reply: { header: (name: string, value: string) => unknown }) {
  const encoded = request.headers.cookie?.split(";")
    .map((item) => item.trim().split("="))
    .find(([name]) => name === SUBMITTER_COOKIE)?.[1];
  const existing = encoded ? decodeURIComponent(encoded) : "";
  if (/^[A-Za-z0-9_-]{24,64}$/.test(existing)) return existing;
  const value = randomBytes(24).toString("base64url");
  const secure = request.protocol === "https" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SUBMITTER_COOKIE}=${encodeURIComponent(value)}; Path=/f/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return value;
}

export async function formsPublicRoutes(app: FastifyInstance) {
  // 公开表单填写页面
  app.get("/f/:formUid", async (request, reply) => {
    const params = z.object({ formUid: z.string().trim().min(1).max(64) }).parse(request.params);
    submitterIdentity(request, reply);
    const page = await renderFormPage(params.formUid);
    const scriptPolicy = page.nonce ? `'self' 'nonce-${page.nonce}'` : "'none'";
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Content-Security-Policy", `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src ${scriptPolicy}; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`)
      .code(page.statusCode)
      .send(page.html);
  });

  // 提交表单数据
  app.post("/f/:formUid/submit", async (request, reply) => {
    const params = z.object({ formUid: z.string().trim().min(1).max(64) }).parse(request.params);
    const body = z.object({
      data: z.record(z.string().max(64), z.unknown()).refine((value) => Object.keys(value).length <= 50, "字段数量超过限制"),
      captchaId: z.string().max(128).optional(),
      captchaCode: z.string().max(16).optional()
    }).refine((value) => Buffer.byteLength(JSON.stringify(value.data), "utf8") <= 64 * 1024, "提交数据超过 64KB").parse(request.body);

    const ip = clientIpFromRequest(request) || request.ip || "";
    const userAgent = request.headers["user-agent"]?.slice(0, 512);
    const submitterId = submitterIdentity(request, reply);

    try {
      const result = await submitForm(params.formUid, body.data, { ip, userAgent, submitterId }, {
        captchaId: body.captchaId,
        captchaCode: body.captchaCode
      });
      return { code: 0, message: "提交成功", data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "提交失败";
      const code = (error as { code?: string }).code || "SUBMIT_ERROR";
      return reply.code(400).send({ code, message });
    }
  });
}
