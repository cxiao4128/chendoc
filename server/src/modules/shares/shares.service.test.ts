import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
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

const { migrate } = await import("../../db/migrate.js");
await migrate();

const { db, sqlite } = await import("../../db/client.js");
const { docVersions, operationLogs, shares, users } = await import("../../db/schema.js");
const { createDoc, getDoc, listDocs, publishDoc, restoreDocVersion, softDeleteDoc, updateDoc } = await import("../docs/docs.service.js");
const { createOrGetShare, getPublicShare, reviewUserShare, updateShare, verifySharePassword } = await import("./shares.service.js");

const adminId = 1;
const userId = 2;
const otherUserId = 3;

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM operation_logs;
    DELETE FROM shares;
    DELETE FROM doc_versions;
    DELETE FROM docs;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('operation_logs', 'shares', 'doc_versions', 'docs', 'users');
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

  db.insert(users).values([
    {
      username: "writer",
      passwordHash: "test-password-hash",
      role: "user",
      status: "active",
      createdAt,
      updatedAt: createdAt
    },
    {
      username: "other",
      passwordHash: "test-password-hash",
      role: "user",
      status: "active",
      createdAt,
      updatedAt: createdAt
    }
  ]).run();
});

afterAll(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});

async function createDocument() {
  const doc = await createDoc(adminId, { title: "Security doc" });
  return await updateDoc(doc.id, adminId, {
    contentHtml: "<p>private content</p>"
  });
}

async function createUserDocument() {
  const doc = await createDoc(userId, { title: "User doc" });
  return await updateDoc(doc.id, userId, {
    contentHtml: "<p>user content</p>"
  }, { id: userId, role: "user" });
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

    await publishDoc(doc.id, adminId);
    expect(await getPublicShare(share.shareCode)).toBeNull();
  });

  test("enabled shares expose docs without extra publish step", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true });

    const draftData = await getPublicShare(share.shareCode);
    expect(draftData?.doc.status).toBe("published");
    expect(draftData?.doc.contentHtml).toBe("<p>private content</p>");

    await publishDoc(doc.id, adminId);
    const data = await getPublicShare(share.shareCode);

    expect(data?.doc.status).toBe("published");
    expect(data?.doc.contentHtml).toBe("<p>private content</p>");
  });

  test("enabled shares cannot expose deleted docs", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true });
    await publishDoc(doc.id, adminId);

    expect(await getPublicShare(share.shareCode)).toBeTruthy();

    await softDeleteDoc(doc.id, adminId);
    expect(await getPublicShare(share.shareCode)).toBeNull();
  });

  test("password shares require the correct password", async () => {
    const doc = await createDocument();
    const share = await createShare(doc.id, { isEnabled: true, password: "correct horse" });
    await publishDoc(doc.id, adminId);

    const data = await getPublicShare(share.shareCode);
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

  test("document detail does not expose share password hash", async () => {
    const doc = await createDocument();
    await createShare(doc.id, { isEnabled: true, password: "correct horse" });

    const detail = await getDoc(doc.id, { id: adminId, role: "admin" }) as { share?: Record<string, unknown> | null };

    expect(detail.share?.hasPassword).toBe(true);
    expect(detail.share).not.toHaveProperty("passwordHash");
  });

  test("document versions are snapshotted at most once every ten minutes", async () => {
    const doc = await createDocument();

    await updateDoc(doc.id, adminId, { contentHtml: "<p>first change</p>" }, { id: adminId, role: "admin" });
    await updateDoc(doc.id, adminId, { contentHtml: "<p>second change</p>" }, { id: adminId, role: "admin" });

    expect(db.select().from(docVersions).where(eq(docVersions.docId, doc.id)).all()).toHaveLength(1);
  });

  test("restoring a version keeps the current state as a rollback version", async () => {
    const doc = await createDocument();
    const version = db.select().from(docVersions).where(eq(docVersions.docId, doc.id)).limit(1).get();

    expect(version?.contentHtml).toBe("<p></p>");

    await restoreDocVersion(doc.id, version!.id, adminId, { id: adminId, role: "admin" });

    const restored = await getDoc(doc.id, { id: adminId, role: "admin" });
    const versions = db.select().from(docVersions).where(eq(docVersions.docId, doc.id)).all();
    expect(restored.contentHtml).toBe("<p></p>");
    expect(versions.some((item) => item.contentHtml === "<p>private content</p>")).toBe(true);
  });
});

describe("audit log coverage", () => {
  test("audit logs can record security-sensitive actions", async () => {
    db.insert(operationLogs).values({
      userId: adminId,
      action: "doc.hard_delete",
      targetType: "doc",
      targetId: "12",
      ip: "127.0.0.1",
      userAgent: "vitest",
      createdAt: new Date()
    }).run();

    const row = db.select().from(operationLogs).where(eq(operationLogs.action, "doc.hard_delete")).limit(1).get();
    expect(row?.targetId).toBe("12");
  });
});

describe("document search", () => {
  test("search results include document summary", async () => {
    const doc = await createDoc(adminId, { title: "Search summary doc" });
    await updateDoc(doc.id, adminId, {
      summary: "quarterly planning search synopsis",
      contentHtml: "<p>body content</p>"
    }, { id: adminId, role: "admin" });

    const results = await listDocs({ id: adminId, role: "admin" }, "planning search");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: doc.id,
      summary: "quarterly planning search synopsis"
    });
  });

  test("soft deleted documents are excluded from search", async () => {
    const liveDoc = await createDoc(adminId, { title: "Live retention needle" });
    await updateDoc(liveDoc.id, adminId, {
      summary: "retention search marker"
    }, { id: adminId, role: "admin" });
    const deletedDoc = await createDoc(adminId, { title: "Deleted retention needle" });
    await updateDoc(deletedDoc.id, adminId, {
      summary: "retention search marker"
    }, { id: adminId, role: "admin" });
    await softDeleteDoc(deletedDoc.id, adminId, { id: adminId, role: "admin" });

    const ids = (await listDocs({ id: adminId, role: "admin" }, "retention search marker")).map((doc) => doc.id);

    expect(ids).toEqual([liveDoc.id]);
    expect(ids).not.toContain(deletedDoc.id);
  });

  test("ordinary users only search their own documents", async () => {
    const ownDoc = await createDoc(userId, { title: "Own search needle" });
    await updateDoc(ownDoc.id, userId, {
      summary: "shared visibility search marker"
    }, { id: userId, role: "user" });
    const otherDoc = await createDoc(otherUserId, { title: "Other search needle" });
    await updateDoc(otherDoc.id, otherUserId, {
      summary: "shared visibility search marker"
    }, { id: otherUserId, role: "user" });

    const ownResults = (await listDocs({ id: userId, role: "user" }, "shared visibility")).map((doc) => doc.id);
    const adminResults = (await listDocs({ id: adminId, role: "admin" }, "shared visibility")).map((doc) => doc.id).sort((a, b) => a - b);

    expect(ownResults).toEqual([ownDoc.id]);
    expect(adminResults).toEqual([ownDoc.id, otherDoc.id].sort((a, b) => a - b));
  });
});

describe("user document share review flow", () => {
  test("ordinary user shares use an 8 digit code and stay private until approved", async () => {
    const doc = await createUserDocument();
    const share = await createOrGetShare(doc.id, { isEnabled: true }, { id: userId, role: "user" });

    expect(share?.shareCode).toBeGreaterThanOrEqual(10000000);
    expect(share?.shareCode).toBeLessThanOrEqual(99999999);
    expect(share?.isEnabled).toBe(false);
    expect(share?.reviewStatus).toBe("pending");
    expect(await getPublicShare(share!.shareCode)).toBeNull();

    await reviewUserShare(share!.id, { action: "approve", shareCode: 87654321 }, adminId);

    expect(await getPublicShare(share!.shareCode)).toBeNull();
    const approved = await getPublicShare(87654321);
    expect(approved?.doc.contentHtml).toBe("<p>user content</p>");
  });

  test("ordinary users cannot customize share code or slug", async () => {
    const doc = await createUserDocument();

    await expect(createOrGetShare(doc.id, { isEnabled: true, shareCode: 12345678 }, { id: userId, role: "user" }))
      .rejects.toThrow("普通用户不能自定义分享链接");
    await expect(createOrGetShare(doc.id, { isEnabled: true, customSlug: "mine" }, { id: userId, role: "user" }))
      .rejects.toThrow("普通用户不能自定义分享链接");
  });

  test("editing an approved user document sends the share back to review", async () => {
    const doc = await createUserDocument();
    const share = await createOrGetShare(doc.id, { isEnabled: true }, { id: userId, role: "user" });
    await reviewUserShare(share!.id, { action: "approve" }, adminId);
    expect(await getPublicShare(share!.shareCode)).toBeTruthy();

    await updateDoc(doc.id, userId, { contentHtml: "<p>changed</p>" }, { id: userId, role: "user" });

    expect(await getPublicShare(share!.shareCode)).toBeNull();
  });

  test("rejected user shares require a document content update before resubmission", async () => {
    const doc = await createUserDocument();
    const share = await createOrGetShare(doc.id, { isEnabled: true }, { id: userId, role: "user" });
    await reviewUserShare(share!.id, { action: "reject", note: "needs changes" }, adminId);

    await expect(updateShare(share!.id, { isEnabled: true }, { id: userId, role: "user" }))
      .rejects.toThrow("未通过文档需更新内容后才可再次提交");

    await updateDoc(doc.id, userId, { contentHtml: "<p>changed after reject</p>" }, { id: userId, role: "user" });
    const resubmitted = db.select().from(shares).where(eq(shares.id, share!.id)).limit(1).get();
    expect(resubmitted?.reviewStatus).toBe("pending");
  });

  test("ordinary users can only read their own documents", async () => {
    const ownDoc = await createUserDocument();
    const adminDoc = await createDocument();

    expect((await listDocs({ id: userId, role: "user" })).map((doc) => doc.id)).toEqual([ownDoc.id]);
    expect((await listDocs({ id: adminId, role: "admin" })).map((doc) => doc.id).sort((a, b) => a - b)).toEqual([adminDoc.id, ownDoc.id].sort((a, b) => a - b));
    await expect(getDoc(adminDoc.id, { id: userId, role: "user" })).rejects.toThrow("文档不存在");
  });

  test("ordinary users cannot manage another user's share", async () => {
    const doc = await createUserDocument();
    const share = await createOrGetShare(doc.id, { isEnabled: true }, { id: userId, role: "user" });

    await expect(updateShare(share!.id, { isEnabled: true }, { id: otherUserId, role: "user" }))
      .rejects.toThrow("文档不存在");
  });
});
