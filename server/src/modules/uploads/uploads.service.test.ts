import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

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
const { uploads, users } = await import("../../db/schema.js");
const { createDoc } = await import("../docs/docs.service.js");
const { createPresignedUpload, deleteUpload, getUploadPolicy } = await import("./uploads.service.js");
const { contentMatchesExtension, hasDangerousDoubleExtension, normalizeUploadMimeType } = await import("./upload-validation.js");
const { finalizeUploadRecord } = await import("./upload-finalize.js");

function bytes(text: string) {
  return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
}

function ftyp(majorBrand: string, ...compatibleBrands: string[]) {
  const result = new Uint8Array(16 + compatibleBrands.length * 4);
  new DataView(result.buffer).setUint32(0, result.length, false);
  result.set(bytes("ftyp"), 4);
  result.set(bytes(majorBrand), 8);
  compatibleBrands.forEach((brand, index) => result.set(bytes(brand), 16 + index * 4));
  return result;
}

const webmBytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, ...bytes("webm")]);
const matroskaBytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, ...bytes("matroska")]);
const theoraBytes = Uint8Array.from([...bytes("OggS"), 0, 0, 0x80, ...bytes("theora")]);
const oggAudioBytes = Uint8Array.from([...bytes("OggS"), 0, 0, 0x01, ...bytes("vorbis")]);

function zipBytes(...entries: string[]) {
  return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...bytes(entries.join("\0"))]);
}

beforeEach(() => {
  sqlite!.exec("DELETE FROM uploads; DELETE FROM docs; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('uploads', 'docs', 'users');");
  db.insert(users).values([
    { username: "owner", passwordHash: "hash", role: "user", status: "active", createdAt: new Date(), updatedAt: new Date() },
    { username: "other", passwordHash: "hash", role: "user", status: "active", createdAt: new Date(), updatedAt: new Date() },
    { username: "admin", passwordHash: "hash", role: "admin", status: "active", createdAt: new Date(), updatedAt: new Date() }
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
      fileName: "payload.exe", mimeType: "application/octet-stream", size: 10, kind: "file", docUid: "XCHENabcdefghijklmnopq"
    })).rejects.toMatchObject({ code: "UPLOAD_EXTENSION_NOT_ALLOWED" });
  });

  test("blocks dangerous embedded extensions but allows ordinary multi-dot names", async () => {
    expect(hasDangerousDoubleExtension("invoice.final.2026.pdf")).toBe(false);
    expect(hasDangerousDoubleExtension("invoice.pdf.js.pdf")).toBe(true);

    await expect(createPresignedUpload(1, { id: 1, role: "user" }, {
      fileName: "invoice.pdf.js.pdf", mimeType: "application/pdf", size: 10, kind: "file", docUid: "XCHENabcdefghijklmnopq"
    })).rejects.toMatchObject({ code: "UPLOAD_DOUBLE_EXTENSION_BLOCKED" });

    await expect(createPresignedUpload(1, { id: 1, role: "user" }, {
      fileName: "invoice.final.2026.pdf", mimeType: "application/pdf", size: 10, kind: "file", docUid: "XCHENabcdefghijklmnopq"
    })).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });
  });

  test("normalizes common browser MIME aliases before policy validation", async () => {
    expect(normalizeUploadMimeType(" IMAGE/PJPEG; charset=binary ")).toBe("image/jpeg");
    expect(normalizeUploadMimeType("application/x-zip-compressed")).toBe("application/zip");

    await expect(createPresignedUpload(1, { id: 1, role: "user" }, {
      fileName: "photo.jpg", mimeType: "image/pjpeg", size: 10, kind: "image", docUid: "XCHENabcdefghijklmnopq"
    })).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });
  });

  test("rejects uploads to another user's document", async () => {
    const doc = await createDoc(1, { title: "owner doc" }, { id: 1, role: "user" });
    await expect(createPresignedUpload(2, { id: 2, role: "user" }, {
      fileName: "note.pdf", mimeType: "application/pdf", size: 10, kind: "file", docUid: doc.docUid
    })).rejects.toMatchObject({ code: "DOC_FORBIDDEN" });
  });

  test("ordinary admin cannot delete a detached upload owned by another account", async () => {
    db.insert(uploads).values({
      userId: 1,
      docId: null,
      objectKey: "docs/files/2026/06/1-aaaaaaaaaaaaaaaaaaaaaaaa.pdf",
      publicUrl: "https://example.test/file.pdf",
      mimeType: "application/pdf",
      fileSize: 10,
      kind: "file",
      originalName: "file.pdf",
      detachedAt: new Date(),
      createdAt: new Date()
    }).run();

    await expect(deleteUpload(1, { id: 3, role: "admin" })).rejects.toMatchObject({ code: "UPLOAD_FORBIDDEN" });
  });
});

describe("upload content signatures", () => {
  test("recognizes image signatures and AVIF compatible brands", () => {
    expect(contentMatchesExtension("photo.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(contentMatchesExtension("photo.avif", ftyp("mif1", "avif"))).toBe(true);
    expect(contentMatchesExtension("photo.avif", ftyp("heic", "mif1"))).toBe(false);
  });

  test.each([
    ["clip.mp4", ftyp("isom", "mp42"), true],
    ["clip.mov", ftyp("qt  "), true],
    ["clip.m4v", ftyp("M4V "), true],
    ["clip.webm", webmBytes, true],
    ["clip.webm", matroskaBytes, false],
    ["clip.ogv", theoraBytes, true],
    ["clip.ogv", oggAudioBytes, false],
    ["clip.mp4", ftyp("heic", "mif1"), false],
    ["clip.mov", ftyp("isom", "mp42"), false]
  ])("validates the actual video container for %s", (fileName, content, expected) => {
    expect(contentMatchesExtension(fileName, content)).toBe(expected);
  });

  test("requires OOXML markers instead of accepting every ZIP as Office", () => {
    expect(contentMatchesExtension("document.docx", zipBytes("[Content_Types].xml", "word/document.xml"))).toBe(true);
    expect(contentMatchesExtension("document.docx", zipBytes("META-INF/MANIFEST.MF", "payload.class"))).toBe(false);
    expect(contentMatchesExtension("archive.zip", zipBytes("META-INF/MANIFEST.MF", "payload.class"))).toBe(true);
  });
});

describe("upload finalization cleanup", () => {
  test("deletes the R2 object when the final locked quota check fails", async () => {
    const quotaError = new Error("quota raced");
    const insert = vi.fn(async () => ({ id: 1 }));
    const cleanup = vi.fn(async () => undefined);

    await expect(finalizeUploadRecord({
      assertQuota: vi.fn(async () => { throw quotaError; }),
      insert,
      findCommitted: vi.fn(async () => undefined),
      resolveCommitted: () => ({ id: 1 }),
      cleanup
    })).rejects.toBe(quotaError);

    expect(insert).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  test("does not delete an object already committed by a raced request", async () => {
    const cleanup = vi.fn(async () => undefined);
    const result = await finalizeUploadRecord({
      assertQuota: vi.fn(async () => undefined),
      insert: vi.fn(async () => { throw new Error("unique constraint"); }),
      findCommitted: vi.fn(async () => ({ id: 9, publicUrl: "https://example.test/raced" })),
      resolveCommitted: (record) => record,
      cleanup
    });

    expect(result).toEqual({ id: 9, publicUrl: "https://example.test/raced" });
    expect(cleanup).not.toHaveBeenCalled();
  });
});
