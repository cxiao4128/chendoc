import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-forms-public-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_PROVIDER: "sqlite", DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret, CONFIG_ENCRYPTION_KEY: secret, RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret, DEFAULT_ADMIN_PASSWORD: "Test!Password123"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { buildApp } = await import("../../app.js");
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const { createForm, publishForm } = await import("./forms.service.js");
const app = await buildApp();
const actor = { id: 1, role: "user" } as const;

beforeEach(() => {
  sqlite.exec("DELETE FROM form_submissions; DELETE FROM forms; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('form_submissions', 'forms', 'users');");
  db.insert(users).values({ username: "writer", passwordHash: "hash", role: "user", status: "active", createdAt: new Date(), updatedAt: new Date() }).run();
});

afterAll(async () => {
  await app.close();
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("public form routes", () => {
  test("accepts multi-letter form gateway actions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/crypto/public-key?action=fm1",
      headers: { "x-client-fingerprint": "form-route-test" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().challenge).toBeTruthy();
  });

  test("serves a nonce-bound CSP and distinct agreement/multiselect fields", async () => {
    const form = await createForm(actor, {
      title: "调查",
      fields: [
        { id: "choices", type: "multiselect", label: "选择", required: false, options: ["A", "B"], order: 0 },
        { id: "agree", type: "checkbox", label: "同意", required: true, order: 1 }
      ]
    });
    await publishForm(form.id, actor);
    const response = await app.inject({ method: "GET", url: `/f/${form.formUid}` });
    expect(response.statusCode).toBe(200);
    const nonce = /<script nonce="([^"]+)">/.exec(response.body)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers["content-security-policy"]).toContain(`'nonce-${nonce}'`);
    expect(response.body.match(/name="choices"/g)).toHaveLength(2);
    expect(response.body.match(/name="agree"/g)).toHaveLength(1);
  });

  test("rejects fields outside the published contract", async () => {
    const form = await createForm(actor, { title: "调查", fields: [{ id: "name", type: "text", label: "姓名", required: true, order: 0 }] });
    await publishForm(form.id, actor);
    const response = await app.inject({
      method: "POST", url: `/f/${form.formUid}/submit`,
      payload: { data: { name: "甲", injected: "x" } }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("FORM_UNKNOWN_FIELD");
  });
});
