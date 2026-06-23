import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { packGatewayReply, unpackGatewayRequest } from "./gateway/middleware.js";
import { gatewayRoutes } from "./gateway/routes.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { shutdownAsyncLogQueue } from "./utils/asyncLogQueue.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { captchaRoutes } from "./modules/captcha/captcha.routes.js";
import { cryptoRoutes } from "./modules/crypto/crypto.routes.js";
import { dangerRoutes } from "./modules/danger/danger.routes.js";
import { docsRoutes } from "./modules/docs/docs.routes.js";
import { purgeExpiredTrashDocs } from "./modules/docs/docs.service.js";
import { formsRoutes } from "./modules/forms/forms.routes.js";
import { formsPublicRoutes } from "./modules/forms/forms.public.routes.js";
import { runFormMaintenance } from "./modules/forms/forms.service.js";
import { invitesRoutes } from "./modules/invites/invites.routes.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { sharesRoutes } from "./modules/shares/shares.routes.js";
import { spacesRoutes } from "./modules/spaces/spaces.routes.js";
import { uploadsRoutes } from "./modules/uploads/uploads.routes.js";
import { currentRequestTiming, enterRequestTiming } from "./utils/requestTiming.js";
import { isHttpsRequest } from "./utils/httpsRequest.js";
import { dbHealthCheck } from "./db/client.js";

export async function buildApp() {
  const app = Fastify({
    bodyLimit: env.bodyLimitBytes,
    logger: {
      level: env.nodeEnv === "production" ? "info" : "debug",
      redact: [
        "req.headers.authorization",
        "*.password",
        "*.dangerPassword",
        "*.otp",
        "*.totp",
        "*.recoveryCode",
        "*.captcha",
        "*.payload",
        "*.encryptedData",
        "*.encryptedPassword",
        "*.secretAccessKey",
        "*.secret",
        "*.totpSecret",
        "*.recoveryCodes",
        "*.accessKeyId",
        "*.sessionKey",
        "*.token",
        "*.authorization",
        "*.key",
        "*.keyId",
        "*.data",
        "*.p",
        "*.iv",
        "*.body",
        "*.challenge"
      ]
    },
    disableRequestLogging: env.nodeEnv === "production",
    trustProxy: env.trustProxy
  });

  registerErrorHandler(app);
  const formMaintenanceTimer = setInterval(() => {
    void runFormMaintenance().catch((error) => app.log.error({ error }, "form maintenance failed"));
  }, 6 * 60 * 60 * 1000);
  formMaintenanceTimer.unref();
  const trashMaintenanceTimer = setInterval(() => {
    void purgeExpiredTrashDocs().catch((error) => app.log.error({ error }, "trash maintenance failed"));
  }, 6 * 60 * 60 * 1000);
  trashMaintenanceTimer.unref();
  app.addHook("onRequest", async (request) => {
    enterRequestTiming(request.id);
    request.headers["x-request-id"] = request.id;
  });
  app.addHook("onClose", async () => {
    clearInterval(formMaintenanceTimer);
    clearInterval(trashMaintenanceTimer);
    await shutdownAsyncLogQueue();
  });
  app.addHook("preValidation", unpackGatewayRequest);
  app.addHook("onSend", packGatewayReply);

  await app.register(fastifyHelmet, {
    frameguard: { action: "sameorigin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "blob:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", ...env.cspConnectSources],
        frameAncestors: ["'self'"]
      }
    },
    global: true
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const secureRequest = isHttpsRequest({
      protocol: request.protocol,
      forwardedProto: request.headers["x-forwarded-proto"],
      remoteAddress: request.raw.socket.remoteAddress,
      publicSiteUrl: env.publicSiteUrl
    });
    if (env.nodeEnv === "production" && env.forceHttps && !secureRequest) {
      if (request.method === "GET" || request.method === "HEAD") {
        const publicOrigin = new URL(env.publicSiteUrl).origin;
        return reply.redirect(`${publicOrigin}${request.url}`, 308);
      }
      return reply.code(426).send({ code: "HTTPS_REQUIRED", message: "HTTPS is required." });
    }
  });

  const requestStartedAt = new WeakMap<object, number>();
  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartedAt.get(request);
    if (!startedAt) return;
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs <= 300) return;
    app.log.warn({
      requestId: request.id,
      actionCode: request.packet?.actionCode,
      status: reply.statusCode,
      durationMs,
      phases: currentRequestTiming()
    }, "slow request");
  });

  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: "1 minute"
  });

  app.get("/api/health", async (_request, reply) => {
    const ok = await dbHealthCheck();
    if (!ok) return reply.code(503).send({ ok: false });
    return reply.header("Cache-Control", "no-store").send({ ok: true, database: "ok" });
  });

  await app.register(publicRoutes);
  await app.register(formsPublicRoutes);
  await app.register(cryptoRoutes);
  await app.register(captchaRoutes);
  await app.register(gatewayRoutes);
  await app.register(authRoutes);
  await app.register(invitesRoutes);
  await app.register(spacesRoutes);
  await app.register(docsRoutes);
  await app.register(sharesRoutes);
  await app.register(uploadsRoutes);
  await app.register(formsRoutes);
  await app.register(settingsRoutes);
  await app.register(dangerRoutes);

  const adminRoot = resolve(env.paths.serverDir, "public/admin");
  if (existsSync(adminRoot)) {
    await app.register(fastifyStatic, {
      root: adminRoot,
      prefix: "/",
      decorateReply: false,
      index: false,
      setHeaders: (res, pathName) => {
        if (/\.(?:avif|css|gif|jpe?g|js|png|svg|webp|woff2?)$/i.test(pathName)) {
          res.setHeader("Cache-Control", pathName.includes("site-assets")
            ? "public, max-age=3600, must-revalidate"
            : "public, max-age=31536000, immutable");
        }
      }
    });
  }

  app.get("/", async (_request, reply) => reply.redirect("/login"));

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ message: "接口不存在" });
    }
    if (request.url.startsWith("/r/")) {
      return reply.code(404).type("text/html; charset=utf-8").send("分享不存在");
    }

    const indexPath = resolve(adminRoot, "index.html");
    if (!existsSync(indexPath)) {
      return reply.code(503).send({ message: "前端资源尚未构建，请先运行 npm run build" });
    }
    const html = await readFile(indexPath, "utf8");
    return reply.header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(html);
  });

  return app;
}
