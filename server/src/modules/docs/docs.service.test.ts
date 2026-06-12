import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const { users } = await import("../../db/schema.js");
const {
  createDoc,
  listDocs,
  listDocsPage,
  listTrashDocs,
  listTrashDocsPage,
  softDeleteDoc
} = await import("./docs.service.js");

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
