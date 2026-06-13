import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-docs-"));
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

const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { docs, users } = await import("../../db/schema.js");
const { generateDocUid, isValidDocUid } = await import("../../utils/docUid.js");
const {
  createDoc,
  getDocByUid,
  listDocVersionsByUid,
  listDocs,
  listDocsPage,
  listTrashDocs,
  listTrashDocsPage,
  softDeleteDoc,
  updateDoc
} = await import("./docs.service.js");

const adminId = 1;
const superAdminId = 2;
const userId = 3;
const otherUserId = 4;
const adminActor = { id: adminId, role: "admin" } as const;
const superAdminActor = { id: superAdminId, role: "admin", isSuperAdmin: true } as const;
const userActor = { id: userId, role: "user" } as const;
const otherUserActor = { id: otherUserId, role: "user" } as const;

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
  db.insert(users).values([
    {
      username: "xchen",
      passwordHash: "test-password-hash",
      role: "admin",
      status: "active",
      createdAt,
      updatedAt: createdAt
    },
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

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

async function createDocuments(count: number) {
  for (let index = 0; index < count; index += 1) {
    await createDoc(adminId, { title: `Doc ${index + 1}` });
  }
}

async function createTrashDocuments(count: number) {
  for (let index = 0; index < count; index += 1) {
    const doc = await createDoc(adminId, { title: `Trash doc ${index + 1}` });
    await softDeleteDoc(doc.id, adminId, adminActor);
  }
}

describe("document list pagination", () => {
  test("listDocs without options uses the default page size", async () => {
    await createDocuments(31);

    const results = await listDocs(adminActor);

    expect(results).toHaveLength(30);
  });

  test("listDocsPage keeps pageSize plus one hasMore detection", async () => {
    await createDocuments(31);

    const result = await listDocsPage(adminActor);

    expect(result.docs).toHaveLength(30);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 30,
      hasMore: true
    });
  });

  test("listTrashDocs without options uses the default page size", async () => {
    await createTrashDocuments(31);

    const results = await listTrashDocs(adminActor);

    expect(results).toHaveLength(30);
  });

  test("listTrashDocsPage keeps pageSize plus one hasMore detection", async () => {
    await createTrashDocuments(31);

    const result = await listTrashDocsPage(adminActor);

    expect(result.docs).toHaveLength(30);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 30,
      hasMore: true
    });
  });
});

describe("document identity and access boundaries", () => {
  test("generateDocUid creates 10000 valid non-duplicated ids", () => {
    const values = new Set<string>();

    for (let index = 0; index < 10_000; index += 1) {
      const docUid = generateDocUid();
      expect(docUid).toHaveLength(24);
      expect(isValidDocUid(docUid)).toBe(true);
      expect(docUid).toMatch(/^[A-Za-z0-9]{16,32}$/);
      expect(docUid).toEqual(expect.stringContaining("X"));
      expect(docUid).toEqual(expect.stringContaining("C"));
      expect(docUid).toEqual(expect.stringContaining("H"));
      expect(docUid).toEqual(expect.stringContaining("E"));
      expect(docUid).toEqual(expect.stringContaining("N"));
      values.add(docUid);
    }

    expect(values.size).toBe(10_000);
  });

  test("database unique index rejects duplicate doc_uid", async () => {
    const first = await createDoc(userId, { title: "Unique uid doc" }, userActor);
    expect(first.docUid).toMatch(/^[A-Za-z0-9]{16,32}$/);

    expect(() => db.insert(docs).values({
      docUid: first.docUid,
      title: "Duplicate uid doc",
      contentJson: "{}",
      contentHtml: "",
      tags: "[]",
      status: "published",
      sort: 0,
      ownerId: userId,
      ownerRole: "user",
      createdBy: userId,
      updatedBy: userId,
      scope: "user",
      isSuperAdminDoc: false,
      visibility: "private",
      tenantKey: "default",
      createdAt: new Date(),
      updatedAt: new Date()
    }).run()).toThrow();
  });

  test("user documents keep owner fields and deny direct doc_uid reads by other users", async () => {
    const doc = await createDoc(userId, { title: "Owner uid doc" }, userActor);

    expect(doc).toMatchObject({
      ownerId: userId,
      ownerRole: "user",
      scope: "user",
      isSuperAdminDoc: false,
      visibility: "private"
    });
    expect((await listDocs(userActor)).map((item) => item.docUid)).toEqual([doc.docUid]);
    expect(await getDocByUid(doc.docUid, userActor)).toMatchObject({ docUid: doc.docUid });
    await expect(getDocByUid(doc.docUid, otherUserActor)).rejects.toThrow("无权访问该文档");
  });

  test("admin can manage normal docs but cannot see super admin docs", async () => {
    const userDoc = await createDoc(userId, { title: "Normal user doc" }, userActor);
    const superDoc = await createDoc(superAdminId, { title: "Super private needle" }, superAdminActor);

    expect(superDoc.isSuperAdminDoc).toBe(true);
    expect((await listDocs(adminActor)).map((item) => item.docUid)).toEqual([userDoc.docUid]);
    expect((await listDocs(adminActor, "Super private needle"))).toHaveLength(0);
    await expect(getDocByUid(superDoc.docUid, adminActor)).rejects.toThrow("无权访问该文档");
  });

  test("super admin can see all docs and editing user docs keeps owner_id unchanged", async () => {
    const userDoc = await createDoc(userId, { title: "Editable user doc" }, userActor);
    const superDoc = await createDoc(superAdminId, { title: "Super owned doc" }, superAdminActor);

    expect((await listDocs(superAdminActor)).map((item) => item.docUid).sort()).toEqual([userDoc.docUid, superDoc.docUid].sort());
    await updateDoc(userDoc.id, superAdminId, { title: "Edited by super" }, superAdminActor);

    const stored = db.select().from(docs).where(eq(docs.id, userDoc.id)).limit(1).get();
    expect(stored?.ownerId).toBe(userId);
    expect(stored?.updatedBy).toBe(superAdminId);
  });

  test("trash and versions stay isolated from super admin docs", async () => {
    const superDoc = await createDoc(superAdminId, { title: "Super trash doc" }, superAdminActor);
    await updateDoc(superDoc.id, superAdminId, { contentHtml: "<p>super version</p>" }, superAdminActor);
    await expect(listDocVersionsByUid(superDoc.docUid, userActor)).rejects.toThrow("无权访问该文档");

    await softDeleteDoc(superDoc.id, superAdminId, superAdminActor);

    expect((await listTrashDocs(userActor)).map((item) => item.docUid)).not.toContain(superDoc.docUid);
  });
});
