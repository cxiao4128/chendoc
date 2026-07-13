import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getFormByUid, incrementFormView, submitForm } from "./forms.service.js";
import { clientIpFromRequest } from "../../utils/requestIp.js";
import { getSiteConfig } from "../settings/site.service.js";
import { createCaptcha } from "../captcha/public-api.js";

const SUBMITTER_COOKIE = "chendoc_form_submitter";
const BUNDLED_LOGO_URL = "/site-assets/chendoc-logo-192.webp";
const formUidSchema = z.object({ formUid: z.string().trim().min(1).max(64) });
const submissionSchema = z.object({
  data: z.record(z.string().max(64), z.unknown()).refine((value) => Object.keys(value).length <= 50, "字段数量超过限制"),
  captchaId: z.string().max(128).optional(),
  captchaCode: z.string().max(16).optional()
}).refine((value) => Buffer.byteLength(JSON.stringify(value.data), "utf8") <= 64 * 1024, "提交数据超过 64KB");

function submitterIdentity(
  request: { headers: { cookie?: string }; protocol?: string },
  reply: { header: (name: string, value: string) => unknown },
  cookiePath: "/f/" | "/api/public/forms/"
) {
  const encoded = request.headers.cookie?.split(";")
    .map((item) => item.trim().split("="))
    .find(([name]) => name === SUBMITTER_COOKIE)?.[1];
  const existing = encoded ? decodeURIComponent(encoded) : "";
  if (/^[A-Za-z0-9_-]{24,64}$/.test(existing)) return existing;
  const value = randomBytes(24).toString("base64url");
  const secure = request.protocol === "https" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SUBMITTER_COOKIE}=${encodeURIComponent(value)}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return value;
}

function publicFormView(form: Awaited<ReturnType<typeof getFormByUid>>, site: Awaited<ReturnType<typeof getSiteConfig>>) {
  return {
    site: {
      name: site.shortName?.trim() || site.brandName?.trim() || "陈书",
      logoUrl: site.preferRemoteLogo && site.logoUrl ? site.logoUrl : BUNDLED_LOGO_URL
    },
    form: {
      formUid: form.formUid,
      title: form.title,
      description: form.description,
      fields: form.fields,
      privacyNotice: form.privacyNotice,
      retentionDays: form.retentionDays
    }
  };
}

function visibleExclusiveInfo(
  formExclusiveInfo: Record<string, string> | null,
  globalShareFooterText: string
) {
  const entries = Object.entries(formExclusiveInfo ?? {})
    .filter(([label, value]) => label.trim() && value.trim());
  if (entries.length > 0) return Object.fromEntries(entries);
  const fallback = globalShareFooterText.trim();
  return fallback ? { "专属信息": fallback } : null;
}

async function handleSubmission(
  request: FastifyRequest,
  reply: FastifyReply,
  cookiePath: "/f/" | "/api/public/forms/"
) {
  const params = formUidSchema.parse(request.params);
  const body = submissionSchema.parse(request.body);
  const ip = clientIpFromRequest(request) || request.ip || "";
  const userAgent = request.headers["user-agent"]?.slice(0, 512);
  const submitterId = submitterIdentity(request, reply, cookiePath);

  try {
    const result = await submitForm(params.formUid, body.data, { ip, userAgent, submitterId }, {
      captchaId: body.captchaId,
      captchaCode: body.captchaCode
    });
    const globalShareFooterText = await getSiteConfig()
      .then((site) => site.shareFooterText)
      .catch(() => "");
    return reply.header("Cache-Control", "no-store").send({
      code: 0,
      message: "提交成功",
      data: {
        ...result,
        exclusiveInfo: visibleExclusiveInfo(result.exclusiveInfo, globalShareFooterText)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "提交失败";
    const code = (error as { code?: string }).code || "SUBMIT_ERROR";
    return reply.header("Cache-Control", "no-store").code(400).send({ code, message });
  }
}

export async function formsPublicRoutes(
  app: FastifyInstance,
  options: FastifyPluginOptions & { serveLegacyPages?: boolean }
) {
  if (options.serveLegacyPages !== false) {
    // 正常一体化部署的兼容页面；API-only 模式不注册这些展示路由。
    app.get("/f/:formUid", async (request, reply) => {
    const params = formUidSchema.parse(request.params);
    submitterIdentity(request, reply, "/f/");
    const { renderFormPage } = await import("./forms.public.js");
    const page = await renderFormPage(params.formUid);
    const scriptPolicy = page.nonce ? `'self' 'nonce-${page.nonce}'` : "'none'";
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Content-Security-Policy", `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src ${scriptPolicy}; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`)
      .code(page.statusCode)
      .send(page.html);
    });

  // 正常一体化部署的服务端页面不加载网关客户端，保留同源验证码入口。
    app.get("/f/:formUid/captcha", async (request, reply) => {
      formUidSchema.parse(request.params);
      return reply.header("Cache-Control", "no-store").send(await createCaptcha());
    });

  // 提交表单数据
    app.post("/f/:formUid/submit", async (request, reply) => {
      return handleSubmission(request, reply, "/f/");
    });
  }

  // 独立静态前端使用的公开 JSON 薄适配；业务校验仍由 forms.service 负责。
  app.get("/api/public/forms/:formUid", async (request, reply) => {
    const params = formUidSchema.parse(request.params);
    submitterIdentity(request, reply, "/api/public/forms/");
    const form = await getFormByUid(params.formUid);
    if (form.status !== "published") {
      return reply.header("Cache-Control", "no-store").code(403).send({
        code: "FORM_NOT_AVAILABLE",
        message: "此表单已关闭"
      });
    }
    const site = await getSiteConfig();
    void incrementFormView(params.formUid).catch(() => undefined);
    return reply.header("Cache-Control", "no-store").send(publicFormView(form, site));
  });

  app.post("/api/public/forms/:formUid/submissions", async (request, reply) => {
    return handleSubmission(request, reply, "/api/public/forms/");
  });
}
