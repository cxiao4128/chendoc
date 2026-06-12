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
const { createOrGetShare } = await import("../shares/shares.service.js");

const app = await buildApp();
const adminId = 1;
const adminActor = { id: adminId, role: "admin" } as const;

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM shares;
    DELETE FROM doc_versions;
    DELETE FROM docs;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('shares', 'doc_versions', 'docs', 'users');
  `);

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
  const share = await createOrGetShare(doc.id, { isEnabled: true, shareCode: 888 }, adminActor);
  if (!share) throw new Error("share was not created");
  return { doc, share };
}

describe("public share route cache headers", () => {
  test("returns content hash ETag and 304 on If-None-Match", async () => {
    const { share } = await createPublicShare("<p>first content</p>");
    const first = await app.inject({ method: "GET", url: `/r/${share.shareCode}` });

    expect(first.statusCode).toBe(200);
    expect(first.body).toContain("first content");
    expect(first.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");

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

  test("keeps short numeric share links and rejects invalid middle range", async () => {
    await createPublicShare("<p>short code</p>");

    const shortCode = await app.inject({ method: "GET", url: "/r/888" });
    expect(shortCode.statusCode).toBe(200);

    db.update(shares).set({ shareCode: 12345, shareToken: "12345" }).where(eq(shares.shareCode, 888)).run();
    const middleRange = await app.inject({ method: "GET", url: "/r/12345" });
    expect(middleRange.statusCode).toBe(404);
  });
});
