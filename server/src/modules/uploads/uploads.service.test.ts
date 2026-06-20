import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-uploads-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_PROVIDER: "sqlite", DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret, CONFIG_ENCRYPTION_KEY: secret, RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret, DEFAULT_ADMIN_PASSWORD: "Test!Password123"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const { createDoc } = await import("../docs/docs.service.js");
const { createPresignedUpload, getUploadPolicy } = await import("./uploads.service.js");

beforeEach(() => {
  sqlite.exec("DELETE FROM uploads; DELETE FROM docs; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('uploads', 'docs', 'users');");
  db.insert(users).values([
    { username: "owner", passwordHash: "hash", role: "user", status: "active", createdAt: new Date(), updatedAt: new Date() },
    { username: "other", passwordHash: "hash", role: "user", status: "active", createdAt: new Date(), updatedAt: new Date() }
  ]).run();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("upload policy and ownership", () => {
  test("publishes exact extension, MIME and size policy", () => {
    const policy = getUploadPolicy();
    expect(policy.image.mimeByExtension[".png"]).toEqual(["image/png"]);
    expect(policy.file.maxBytes).toBeGreaterThan(0);
  });

  test("rejects extension/MIME mismatch before contacting R2", async () => {
    await expect(createPresignedUpload(1, { id: 1, role: "user" }, {
      fileName: "payload.exe", mimeType: "application/octet-stream", size: 10, kind: "file"
    })).rejects.toMatchObject({ code: "UPLOAD_EXTENSION_NOT_ALLOWED" });
  });

  test("rejects uploads to another user's document", async () => {
    const doc = await createDoc(1, { title: "owner doc" }, { id: 1, role: "user" });
    await expect(createPresignedUpload(2, { id: 2, role: "user" }, {
      fileName: "note.pdf", mimeType: "application/pdf", size: 10, kind: "file", docUid: doc.docUid
    })).rejects.toMatchObject({ code: "DOC_FORBIDDEN" });
  });
});
