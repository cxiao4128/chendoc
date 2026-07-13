import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-spaces-service-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret,
  CONFIG_ENCRYPTION_KEY: secret,
  RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret,
  DEFAULT_ADMIN_PASSWORD: "Test!Password123"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { spaces, users } = await import("../../db/schema.js");
const { createSpace, deleteSpace, updateSpace } = await import("./spaces.service.js");

beforeEach(() => {
  sqlite.exec("DELETE FROM spaces; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('spaces', 'users');");
  const date = new Date();
  db.insert(users).values([
    { username: "owner", passwordHash: "x", role: "user", status: "active", createdAt: date, updatedAt: date },
    { username: "attacker", passwordHash: "x", role: "user", status: "active", createdAt: date, updatedAt: date }
  ]).run();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("space ownership", () => {
  test("blocks cross-user updates and deletes", async () => {
    const created = await createSpace(1, { name: "owner-space" });
    const attacker = { id: 2, role: "user" as const };

    await expect(updateSpace(created.id, { name: "stolen" }, attacker)).rejects.toThrow();
    await expect(deleteSpace(created.id, attacker)).rejects.toThrow();

    const stored = db.select().from(spaces).get();
    expect(stored?.name).toBe("owner-space");
    expect(stored?.ownerId).toBe(1);
  });

  test("allows super admin to manage any space", async () => {
    const created = await createSpace(1, { name: "owner-space" });
    const superAdmin = { id: 2, role: "admin" as const, isSuperAdmin: true };

    await updateSpace(created.id, { name: "managed" }, superAdmin);
    expect(db.select().from(spaces).get()?.name).toBe("managed");
    await deleteSpace(created.id, superAdmin);
    expect(db.select().from(spaces).all()).toHaveLength(0);
  });
});
