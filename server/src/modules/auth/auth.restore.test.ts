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
const app = await buildApp();

beforeEach(() => {
  sqlite!.exec("DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name = 'users';");
  db.insert(users).values({
    username: "writer",
    passwordHash: "hash",
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
