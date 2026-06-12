import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { renderSharePage } from "./public.service.js";

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
  return Number.isFinite(since) && lastModified.getTime() <= since;
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/r/:shareKey", async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const nonce = randomBytes(16).toString("base64url");
    const page = await renderSharePage(params.shareKey, undefined, nonce);
    const cacheControl = page.cacheControl || "no-store";

    reply.header("Cache-Control", cacheControl);
    if (page.etag) reply.header("ETag", page.etag);
    if (page.contentHash) reply.header("X-Content-Hash", page.contentHash);
    if (page.lastModified) reply.header("Last-Modified", page.lastModified.toUTCString());

    if (page.etag && ifNoneMatchHit(request.headers["if-none-match"], page.etag)) {
      return reply.code(304).send();
    }
    if (!request.headers["if-none-match"] && page.lastModified && ifModifiedSinceHit(request.headers["if-modified-since"], page.lastModified)) {
      return reply.code(304).send();
    }

    page.recordView?.();
    return reply
      .header("Content-Security-Policy", [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        "style-src 'self' 'unsafe-inline'",
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
