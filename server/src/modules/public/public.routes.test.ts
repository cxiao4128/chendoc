import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-public-"));
const testSecret = "x".repeat(32);

process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = join(tempDir, "chendoc.sqlite");
process.env.JWT_SECRET = testSecret;
process.env.CONFIG_ENCRYPTION_KEY = testSecret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = testSecret;
process.env.CHENDOC_DOCUMENT_ENCRYPTION_KEY = testSecret;
process.env.PUBLIC_SITE_URL = "http://127.0.0.1:8985";
process.env.DEFAULT_ADMIN_PASSWORD = "Test!Password123";

const { migrate } = await import("../../db/migrate.js");
await migrate();

const { buildApp } = await import("../../app.js");
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { shares, users } = await import("../../db/schema.js");
const { createDoc, updateDoc } = await import("../docs/docs.service.js");
const { createOrGetShare, invalidateDecryptedDocCache } = await import("../shares/shares.service.js");
const { invalidateShareHtmlCache } = await import("./share-html-cache.js");
const { invalidateSiteBrandCache } = await import("./site-brand-cache.js");
const { saveSiteConfig } = await import("../settings/site.service.js");

const app = await buildApp();
const adminId = 1;
const adminActor = { id: adminId, role: "admin" } as const;

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM settings;
    DELETE FROM shares;
    DELETE FROM doc_versions;
    DELETE FROM docs;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('shares', 'doc_versions', 'docs', 'users');
  `);
  invalidateDecryptedDocCache();
  invalidateShareHtmlCache();
  invalidateSiteBrandCache();

  const createdAt = new Date();
  db.insert(users).values({
    username: "admin",
    passwordHash: "test-password-hash",
    role: "admin",
    status: "active",
    createdAt,
    updatedAt: createdAt
  }).run();
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

async function createPublicShare(contentHtml: string) {
  const doc = await createDoc(adminId, { title: "Cache doc" });
  await updateDoc(doc.id, adminId, {
    summary: "Cache summary",
    contentHtml
  }, adminActor);
  const share = await createOrGetShare(doc.id, { isEnabled: true }, adminActor);
  if (!share) throw new Error("share was not created");
  return { doc, share };
}

describe("public share route cache headers", () => {
  test("returns content hash ETag and 304 on If-None-Match", async () => {
    const { share } = await createPublicShare("<p>first content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    expect(first.statusCode).toBe(200);
    expect(first.body).toContain("first content");
    expect(first.headers["cache-control"]).toBe("private, no-cache, must-revalidate");

    const etag = String(first.headers.etag);
    const contentHash = String(first.headers["x-content-hash"]);
    expect(contentHash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(etag).toBe(`"share-${contentHash}"`);

    const cached = await app.inject({
      method: "GET",
      url: `/r/${share.shareCode}`,
      headers: { "if-none-match": etag }
    });

    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
    expect(cached.headers.etag).toBe(etag);
    expect(cached.headers["cache-control"]).toBe("private, no-cache, must-revalidate");
  });

  test("revalidates public share JSON and keeps 304 responses private", async () => {
    const { share } = await createPublicShare("<p>api content</p>");
    const first = await app.inject({ method: "GET", url: `/api/public/r/${share.shareCode}` });
    const etag = String(first.headers.etag);

    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("private, no-cache, must-revalidate");

    const cached = await app.inject({
      method: "GET",
      url: `/api/public/r/${share.shareCode}`,
      headers: { "if-none-match": `W/${etag}, "unrelated"` }
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.headers["cache-control"]).toBe("private, no-cache, must-revalidate");

    db.update(shares).set({ isEnabled: false }).where(eq(shares.id, share.id)).run();
    const disabled = await app.inject({ method: "GET", url: `/api/public/r/${share.shareCode}` });
    expect(disabled.statusCode).toBe(404);
    expect(disabled.headers["cache-control"]).toBe("no-store");
  });

  test("refreshes the CSP nonce when cached HTML is reused", async () => {
    const { share } = await createPublicShare("<p>nonce content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    const second = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    const firstNonce = /'nonce-([^']+)'/.exec(String(first.headers["content-security-policy"]))?.[1];
    const secondNonce = /'nonce-([^']+)'/.exec(String(second.headers["content-security-policy"]))?.[1];
    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(secondNonce).not.toBe(firstNonce);
    expect(first.headers["content-security-policy"]).toContain(`'nonce-${firstNonce}'`);
    expect(second.headers["content-security-policy"]).toContain(`'nonce-${secondNonce}'`);
    expect(first.body).not.toContain("__CHENDOC_CSP_NONCE__");
    expect(second.body).not.toContain("__CHENDOC_CSP_NONCE__");
    expect(first.headers.etag).toBe(second.headers.etag);
  });

  test("returns 304 for the emitted second-precision Last-Modified value", async () => {
    const { share } = await createPublicShare("<p>modified content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    const cached = await app.inject({
      method: "GET",
      url: `/r/${share.shareCode}`,
      headers: { "if-modified-since": String(first.headers["last-modified"]) }
    });

    expect(cached.statusCode).toBe(304);
    expect(cached.headers["cache-control"]).toBe("private, no-cache, must-revalidate");
  });

  test("changes ETag when share page content changes", async () => {
    const { doc, share } = await createPublicShare("<p>first content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    const oldEtag = String(first.headers.etag);

    await updateDoc(doc.id, adminId, { contentHtml: "<p>second content</p>" }, adminActor);

    const changed = await app.inject({
      method: "GET",
      url: `/r/${share.shareCode}`,
      headers: { "if-none-match": oldEtag }
    });

    expect(changed.statusCode).toBe(200);
    expect(changed.body).toContain("second content");
    expect(changed.headers.etag).not.toBe(oldEtag);
  });

  test("invalidates cached branding after site settings change", async () => {
    const { share } = await createPublicShare("<p>brand content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    await saveSiteConfig({
      brandName: "Fresh Brand Long",
      shortName: "Fresh Brand",
      shareFooterText: "Fresh footer"
    });
    const changed = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    expect(changed.statusCode).toBe(200);
    expect(changed.body).toContain("Fresh Brand");
    expect(changed.body).toContain("Fresh footer");
    expect(changed.headers.etag).not.toBe(first.headers.etag);
  });

  test("revalidates share availability before returning 304", async () => {
    const { share } = await createPublicShare("<p>cached content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    const etag = String(first.headers.etag);

    db.update(shares).set({ isEnabled: false }).where(eq(shares.id, share.id)).run();
    const disabled = await app.inject({
      method: "GET",
      url: `/r/${share.shareCode}`,
      headers: { "if-none-match": etag }
    });

    expect(disabled.statusCode).toBe(404);
    expect(disabled.body).toContain("分享暂不可用或不存在");
  });

  test("keeps short numeric share links and rejects invalid middle range", async () => {
    const { share } = await createPublicShare("<p>short code</p>");

    const shortCode = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });
    expect(shortCode.statusCode).toBe(200);

    db.update(shares).set({ shareCode: 12345, shareToken: "12345" }).where(eq(shares.shareCode, share.shareCode)).run();
    const middleRange = await app.inject({ method: "GET", url: "/r/12345" });
    expect(middleRange.statusCode).toBe(404);
  });

  test("uses one unavailable response for missing, disabled, expired, and deleted shares", async () => {
    const { doc, share } = await createPublicShare("<p>private state</p>");
    const missing = await app.inject({ method: "GET", url: "/r/777" });

    db.update(shares).set({ isEnabled: false }).where(eq(shares.id, share.id)).run();
    const disabled = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    db.update(shares).set({ isEnabled: true, expireAt: new Date(Date.now() - 1000) }).where(eq(shares.id, share.id)).run();
    const expired = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    await updateDoc(doc.id, adminId, { status: "published" }, adminActor);
    db.update(shares).set({ expireAt: null }).where(eq(shares.id, share.id)).run();
    db.delete(shares).where(eq(shares.id, share.id)).run();
    const deleted = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    for (const response of [missing, disabled, expired, deleted]) {
      expect(response.statusCode).toBe(404);
      expect(response.body).toContain("分享暂不可用或不存在");
    }
  });

  test("does not expose a protected document title before password verification", async () => {
    const doc = await createDoc(adminId, { title: "Confidential title" });
    const share = await createOrGetShare(doc.id, { isEnabled: true, password: "StrongSharePassword" }, adminActor);
    const response = await app.inject({ method: "GET", url: `/r/${share!.shareCode}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("受保护的分享");
    expect(response.body).not.toContain("Confidential title");
    expect(response.headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect(response.body).toContain('data-share-form autocomplete="off"');
    expect(response.body).toContain('name="chendoc-public-share-access-password"');
    expect(response.body).toContain('autocomplete="section-public-share new-password"');
    expect(response.body).not.toContain('autocomplete="current-password"');
  });

  test("serves share CSS as a cacheable static asset", async () => {
    const response = await app.inject({ method: "GET", url: "/share-page.css" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/css");
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
  });
});
