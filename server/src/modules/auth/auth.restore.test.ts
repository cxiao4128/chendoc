import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-auth-restore-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret,
  CONFIG_ENCRYPTION_KEY: secret,
  RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret,
  DEFAULT_ADMIN_PASSWORD: "Test!Password123",
  PUBLIC_SITE_URL: "http://127.0.0.1:8985"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { buildApp } = await import("../../app.js");
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const { createAuthSession } = await import("./session.service.js");
const { getSystemOverview } = await import("../settings/settings.service.js");
const { setSetting } = await import("../settings/core.service.js");
const { getR2Config, saveR2Config } = await import("../settings/storage.service.js");
const { hashPassword } = await import("../../utils/password.js");
const writerPassword = "Writer!Password123";
const writerPasswordHash = await hashPassword(writerPassword);
const app = await buildApp();

beforeEach(() => {
  sqlite!.exec("DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name = 'users';");
  db.insert(users).values({
    username: "writer",
    passwordHash: writerPasswordHash,
    role: "user",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  }).run();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("auth session restore", () => {
  test("migration creates every table used by registered feature routes", () => {
    const expected = [
      "tags", "tag_hierarchy", "templates", "access_logs", "jwt_keys",
      "totp_failures", "search_history", "doc_comments", "doc_comment_reactions"
    ];
    const rows = sqlite!.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${expected.map(() => "?").join(",")})`
    ).all(...expected) as Array<{ name: string }>;
    expect(rows.map((row) => row.name).sort()).toEqual([...expected].sort());
  });

  test("settings preserve their declared value type", async () => {
    await setSetting("test.boolean", "true", "boolean");
    const row = sqlite!.prepare("SELECT type FROM settings WHERE key = ?").get("test.boolean") as { type: string };
    expect(row.type).toBe("boolean");
  });

  test("saving masked R2 fields preserves the stored credentials", async () => {
    await setSetting("r2.account_id", "account");
    await setSetting("r2.access_key_id", "access-key-123456");
    await setSetting("r2.secret_access_key", "secret-key-123456");
    await setSetting("r2.bucket", "bucket");
    await setSetting("r2.public_url", "https://files.example.com");
    const masked = await getR2Config(false);

    await saveR2Config({ ...masked, bucket: "next-bucket" });
    const stored = await getR2Config(true);

    expect(stored.accessKeyId).toBe("access-key-123456");
    expect(stored.secretAccessKey).toBe("secret-key-123456");
    expect(stored.bucket).toBe("next-bucket");
  });

  test("feature routes are registered and their backing tables are usable", async () => {
    const templatesResponse = await app.inject({ method: "GET", url: "/api/templates/builtin" });
    expect(templatesResponse.statusCode).toBe(200);
    expect(templatesResponse.json()).toEqual({ templates: [] });

    const statsResponse = await app.inject({
      method: "POST",
      url: "/api/stats/track",
      payload: { type: "doc", id: 1 }
    });
    expect(statsResponse.statusCode).toBe(200);
    expect(statsResponse.json()).toEqual({ success: true });

    const tagsResponse = await app.inject({ method: "GET", url: "/api/tags" });
    expect(tagsResponse.statusCode).toBe(401);
  });

  test("system overview aggregates SQLite timestamps without raw Date bindings", async () => {
    const overview = await getSystemOverview();
    expect(overview.database.status).toBe("ok");
    expect(overview.security.activeSessions).toBe(0);
  });

  test("restores an active session from the HttpOnly cookie value", async () => {
    const session = await createAuthSession({ id: 1, username: "writer", role: "user" });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/restore",
      headers: { cookie: `chendoc_session=${encodeURIComponent(session.token)}` },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: session.token, user: { id: 1, username: "writer" } });
  });

  test("login issues the HttpOnly cookie required by session restore", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "writer", password: writerPassword }
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.headers["set-cookie"]).toContain("chendoc_session=");
    expect(loginResponse.headers["set-cookie"]).toContain("HttpOnly");

    const cookie = String(loginResponse.headers["set-cookie"]).split(";")[0]!;
    const restoreResponse = await app.inject({
      method: "POST",
      url: "/api/auth/restore",
      headers: { cookie },
      payload: {}
    });

    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toMatchObject({ user: { id: 1, username: "writer" } });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { authorization: `Bearer ${loginResponse.json().token}` },
      payload: {}
    });
    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.headers["set-cookie"]).toContain("chendoc_session=");
    expect(refreshResponse.headers["set-cookie"]).not.toContain("Secure");
  });

  test("disabled accounts cannot restore an existing session", async () => {
    const session = await createAuthSession({ id: 1, username: "writer", role: "user" });
    db.update(users).set({ status: "disabled", updatedAt: new Date() }).run();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/restore",
      headers: { cookie: `chendoc_session=${encodeURIComponent(session.token)}` },
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });
});
