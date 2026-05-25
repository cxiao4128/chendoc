import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./middleware/error.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { captchaRoutes } from "./modules/captcha/captcha.routes.js";
import { cryptoRoutes } from "./modules/crypto/crypto.routes.js";
import { dangerRoutes } from "./modules/danger/danger.routes.js";
import { docsRoutes } from "./modules/docs/docs.routes.js";
import { invitesRoutes } from "./modules/invites/invites.routes.js";
import { publicRoutes } from "./modules/public/public.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { sharesRoutes } from "./modules/shares/shares.routes.js";
import { spacesRoutes } from "./modules/spaces/spaces.routes.js";
import { uploadsRoutes } from "./modules/uploads/uploads.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "*.password", "*.payload", "*.encryptedData", "*.encryptedPassword", "*.secretAccessKey", "*.accessKeyId"]
    },
    trustProxy: true
  });

  registerErrorHandler(app);

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
        connectSrc: ["'self'", "https:"],
        frameAncestors: ["'self'"]
      }
    },
    global: true
  });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  });

  const requestStartedAt = new WeakMap<object, number>();
  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now());
  });

  app.addHook("onResponse", async (request) => {
    const startedAt = requestStartedAt.get(request);
    if (!startedAt) return;
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs <= 300) return;
    const pathName = request.url.split("?")[0] || request.url;
    app.log.warn({
      method: request.method,
      path: pathName,
      durationMs,
      queryName: request.routeOptions.url ?? pathName
    }, "slow request");
  });

  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: "1 minute"
  });

  await app.register(publicRoutes);
  await app.register(cryptoRoutes);
  await app.register(captchaRoutes);
  await app.register(authRoutes);
  await app.register(invitesRoutes);
  await app.register(spacesRoutes);
  await app.register(docsRoutes);
  await app.register(sharesRoutes);
  await app.register(uploadsRoutes);
  await app.register(settingsRoutes);
  await app.register(dangerRoutes);

  const adminRoot = resolve(env.paths.serverDir, "public/admin");
  if (existsSync(adminRoot)) {
    await app.register(fastifyStatic, {
      root: adminRoot,
      prefix: "/",
      decorateReply: false,
      index: false,
      wildcard: false,
      setHeaders: (res, pathName) => {
        if (/\.(?:avif|gif|jpe?g|png|svg|webp|woff2?)$/i.test(pathName)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
