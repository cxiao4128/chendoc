import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-forms-public-"));
const secret = "f".repeat(32);
process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = join(tempDir, "forms.sqlite");
process.env.JWT_SECRET = secret;
process.env.CONFIG_ENCRYPTION_KEY = secret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = secret;
process.env.CHENDOC_DOCUMENT_ENCRYPTION_KEY = secret;
process.env.PUBLIC_SITE_URL = "http://127.0.0.1:8985";

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { buildApp } = await import("../../app.js");
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const { createForm, publishForm } = await import("./forms.service.js");
const app = await buildApp();
const actor = { id: 1, role: "admin" } as const;

beforeEach(() => {
  sqlite.exec("DELETE FROM form_submissions; DELETE FROM forms; DELETE FROM users;");
  const date = new Date();
  db.insert(users).values({ username: "forms-admin", passwordHash: "x", role: "admin", status: "active", createdAt: date, updatedAt: date }).run();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("public form CSP", () => {
  test("authorizes exactly the generated inline script nonce", async () => {
    const form = await createForm(actor, {
      title: "安全表单",
      fields: [{ id: "name", type: "text", label: "姓名", required: true, order: 0 }]
    });
    await publishForm(form.id, actor);
    const response = await app.inject({ method: "GET", url: `/f/${form.formUid}` });
    expect(response.statusCode).toBe(200);
    const nonce = response.body.match(/<script nonce="([^"]+)">/)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers["content-security-policy"]).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(response.headers["content-security-policy"]).toContain("connect-src 'self'");
  });
});
