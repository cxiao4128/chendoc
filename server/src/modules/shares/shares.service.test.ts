import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-shares-"));
const testSecret = "x".repeat(32);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = join(tempDir, "chendoc.sqlite");
process.env.JWT_SECRET = testSecret;
process.env.CONFIG_ENCRYPTION_KEY = testSecret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = testSecret;
process.env.PUBLIC_SITE_URL = "http://127.0.0.1:8985";
process.env.DEFAULT_ADMIN_PASSWORD = "Test!Password123";

await import("../../db/migrate.js");

const { db, sqlite } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const { createDoc, publishDoc, softDeleteDoc, updateDoc } = await import("../docs/docs.service.js");
const { createOrGetShare, getPublicShare, updateShare, verifySharePassword } = await import("./shares.service.js");

const adminId = 1;

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

afterAll(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});

async function createDocument() {
  const doc = createDoc(adminId, { title: "Security doc" });
  return updateDoc(doc.id, adminId, {
    contentHtml: "<p>private content</p>"
  });
}

async function createShare(docId: number, input: unknown = {}) {
  const share = await createOrGetShare(docId, input);
  if (!share) throw new Error("share was not created");
  return share;
}

function tokenOf(result: Awaited<ReturnType<typeof verifySharePassword>>) {
  return "token" in result ? result.token : undefined;
}

describe("share public access boundary", () => {
  test("new shares are disabled by default", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id);

    expect(share.isEnabled).toBe(false);

    publishDoc(doc.id, adminId);
    expect(getPublicShare(share.shareCode)).toBeNull();
  });

  test("enabled shares expose docs without extra publish step", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true });

    const draftData = getPublicShare(share.shareCode);
    expect(draftData?.doc.status).toBe("published");
    expect(draftData?.doc.contentHtml).toBe("<p>private content</p>");

    publishDoc(doc.id, adminId);
    const data = getPublicShare(share.shareCode);

    expect(data?.doc.status).toBe("published");
    expect(data?.doc.contentHtml).toBe("<p>private content</p>");
  });

  test("enabled shares cannot expose deleted docs", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true });
    publishDoc(doc.id, adminId);

    expect(getPublicShare(share.shareCode)).toBeTruthy();

    softDeleteDoc(doc.id, adminId);
    expect(getPublicShare(share.shareCode)).toBeNull();
  });

  test("password shares require the correct password", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true, password: "correct horse" });
    publishDoc(doc.id, adminId);

    const data = getPublicShare(share.shareCode);
    expect(data?.protected).toBe(true);

    const rejected = await verifySharePassword(share.shareCode, "wrong password");
    expect(rejected.ok).toBe(false);
    expect(tokenOf(rejected)).toBeUndefined();

    const accepted = await verifySharePassword(share.shareCode, "correct horse");
    expect(accepted.ok).toBe(true);
    expect(typeof tokenOf(accepted)).toBe("string");

    await updateShare(share.id, { isEnabled: false });
    const disabled = await verifySharePassword(share.shareCode, "correct horse");
    expect(disabled.ok).toBe(false);
    expect(tokenOf(disabled)).toBeUndefined();
  });
});
