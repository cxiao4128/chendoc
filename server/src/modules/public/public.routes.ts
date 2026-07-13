import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { renderSharePage } from "./public.service.js";
import { sharePageStyle } from "./sharePageStyle.js";
import { enqueueSecurityLog } from "../../utils/asyncLogQueue.js";

function joinedHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(",") : value;
}

function weakValue(etag: string) {
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function ifNoneMatchHit(value: string | string[] | undefined, etag: string) {
  const header = joinedHeader(value);
  if (!header) return false;
  const current = weakValue(etag);
  return header.split(",").some((candidate) => {
    const token = candidate.trim();
    return token === "*" || weakValue(token) === current;
  });
}

function ifModifiedSinceHit(value: string | string[] | undefined, lastModified: Date) {
  const header = joinedHeader(value);
  if (!header) return false;
  const since = Date.parse(header);
  return Number.isFinite(since)
    && Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

function parseIfModifiedSince(header: string | string[] | undefined): Date | undefined {
  const value = joinedHeader(header);
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

export async function publicRoutes(app: FastifyInstance) {
  const publicShareRateLimit = { max: 30, timeWindow: "1 minute" };
  app.get("/share-page.css", async (_request, reply) => reply
    .header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
    .type("text/css; charset=utf-8")
    .send(sharePageStyle));

  app.get("/r/:shareKey", { config: { rateLimit: publicShareRateLimit } }, async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const nonce = randomBytes(16).toString("base64url");

    const ifNoneMatch = joinedHeader(request.headers["if-none-match"]);
    const ifModifiedSince = parseIfModifiedSince(request.headers["if-modified-since"]);

    const page = await renderSharePage(params.shareKey, undefined, nonce);
    const cacheControl = page.cacheControl || "no-store";

    reply.header("Cache-Control", cacheControl);
    if (page.etag) reply.header("ETag", page.etag);
    if (page.contentHash) reply.header("X-Content-Hash", page.contentHash);
    if (page.lastModified) reply.header("Last-Modified", page.lastModified.toUTCString());

    // 再次检查 ETag（渲染后可能已缓存）
    if (page.etag && ifNoneMatchHit(ifNoneMatch, page.etag)) {
      return reply.code(304).send();
    }
    if (!ifNoneMatch && page.lastModified && ifModifiedSinceHit(ifModifiedSince ? ifModifiedSince.toUTCString() : undefined, page.lastModified)) {
      return reply.code(304).send();
    }

    page.recordView?.();
    enqueueSecurityLog({
      action: page.statusCode === 200 ? "share.page.access" : "share.page.unavailable",
      targetType: "share",
      targetId: params.shareKey,
      ip: request.ip,
      statusCode: page.statusCode,
      message: page.statusCode === 200 ? "share page access" : "share page unavailable"
    });
    return reply
      .header("Content-Security-Policy", [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        "style-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'"
      ].join("; "))
      .code(page.statusCode)
      .type("text/html; charset=utf-8")
      .send(page.html);
  });
}
