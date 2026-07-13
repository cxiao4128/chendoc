import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-users-service-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret,
  CONFIG_ENCRYPTION_KEY: secret,
  RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret,
  DEFAULT_ADMIN_USERNAME: "root",
  DEFAULT_ADMIN_PASSWORD: "Test!Password123"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const {
  docCommentReactions,
  docComments,
  docs,
  searchHistory,
  tags,
  templates,
  totpFailures,
  users
} = await import("../../db/schema.js");
const { deleteManagedUser } = await import("./users.service.js");

const actor = { id: 1, role: "admin" as const, isSuperAdmin: true };

function seedUsersAndDoc() {
  const date = new Date();
  db.insert(users).values([
    { id: 1, username: "root", passwordHash: "x", role: "admin", status: "active", isSuperAdmin: true, createdAt: date, updatedAt: date },
    { id: 2, username: "writer", passwordHash: "x", role: "user", status: "active", createdAt: date, updatedAt: date }
  ]).run();
  db.insert(docs).values({
    docUid: "DocUid1234567890",
    title: "writer-doc",
    contentJson: "{}",
    contentHtml: "",
    ownerId: 2,
    ownerRole: "user",
    createdBy: 2,
    scope: "user",
    createdAt: date,
    updatedAt: date
  }).run();
  return date;
}

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM doc_comment_reactions;
    DELETE FROM doc_comments;
    DELETE FROM search_history;
    DELETE FROM totp_failures;
    DELETE FROM tag_hierarchy;
    DELETE FROM tags;
    DELETE FROM templates;
    DELETE FROM docs;
    DELETE FROM users;
  `);
  seedUsersAndDoc();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("managed user deletion", () => {
  test("reassigns reusable assets and removes private account data", async () => {
    const date = new Date();
    db.insert(tags).values([
      { name: "same", color: "#3b82f6", ownerId: 1, docCount: 0, createdAt: date },
      { name: "same", color: "#3b82f6", ownerId: 2, docCount: 0, createdAt: date },
      { name: "unique", color: "#10b981", ownerId: 2, docCount: 0, createdAt: date }
    ]).run();
    db.insert(templates).values([
      { templateUid: "root-template", title: "same-template", html: "root", contentJson: "", ownerId: 1, createdAt: date, updatedAt: date },
      { templateUid: "user-template-1", title: "same-template", html: "user", contentJson: "", ownerId: 2, createdAt: date, updatedAt: date },
      { templateUid: "user-template-2", title: "unique-template", html: "user", contentJson: "", ownerId: 2, createdAt: date, updatedAt: date }
    ]).run();
    db.insert(totpFailures).values({
      userId: 2, dimension: "account", dimensionValue: "2", failCount: 1, firstFailedAt: date, lastFailedAt: date
    }).run();
    db.insert(searchHistory).values({
      userId: 2, query: "secret", queryHash: "hash", searchMode: "fulltext", resultCount: 0, searchTime: 1, createdAt: date
    }).run();
    const sourceComment = db.insert(docComments).values({
      docUid: "DocUid1234567890", userId: 2, content: "remove", status: "active", createdAt: date, updatedAt: date
    }).run();
    const keptComment = db.insert(docComments).values({
      docUid: "DocUid1234567890", userId: 1, content: "keep", status: "active", createdAt: date, updatedAt: date
    }).run();
    db.insert(docCommentReactions).values([
      { commentId: Number(sourceComment.lastInsertRowid), userId: 1, reaction: "like", createdAt: date },
      { commentId: Number(keptComment.lastInsertRowid), userId: 2, reaction: "like", createdAt: date }
    ]).run();

    await deleteManagedUser(2, actor);

    expect(db.select().from(users).where(eq(users.id, 2)).get()).toBeUndefined();
    expect(db.select().from(docs).get()?.ownerId).toBe(1);
    expect(db.select().from(tags).where(eq(tags.ownerId, 1)).all().map((tag) => tag.name).sort()).toEqual(["same", "unique"]);
    expect(db.select().from(templates).where(eq(templates.ownerId, 1)).all()).toHaveLength(3);
    expect(db.select().from(totpFailures).all()).toHaveLength(0);
    expect(db.select().from(searchHistory).all()).toHaveLength(0);
    expect(db.select().from(docComments).all().map((comment) => comment.content)).toEqual(["keep"]);
    expect(db.select().from(docCommentReactions).all()).toHaveLength(0);
  });

  test("rolls back every reassignment when final user deletion fails", async () => {
    const date = new Date();
    db.insert(tags).values({ name: "writer-tag", color: "#3b82f6", ownerId: 2, docCount: 0, createdAt: date }).run();
    sqlite.exec(`
      CREATE TRIGGER fail_managed_user_delete
      BEFORE DELETE ON users
      WHEN OLD.id = 2
      BEGIN
        SELECT RAISE(ABORT, 'forced user deletion failure');
      END;
    `);
    try {
      await expect(deleteManagedUser(2, actor)).rejects.toThrow(/forced user deletion failure/);
      expect(db.select().from(users).where(eq(users.id, 2)).get()).toBeDefined();
      expect(db.select().from(docs).get()?.ownerId).toBe(2);
      expect(db.select().from(tags).get()?.ownerId).toBe(2);
    } finally {
      sqlite.exec("DROP TRIGGER IF EXISTS fail_managed_user_delete;");
    }
  });
});
