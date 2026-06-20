import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "chendoc-session-"));
const secret = "s".repeat(32);
process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = join(dir, "session.sqlite");
process.env.JWT_SECRET = secret;
process.env.CONFIG_ENCRYPTION_KEY = secret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = secret;
process.env.CHENDOC_DOCUMENT_ENCRYPTION_KEY = secret;
process.env.PUBLIC_SITE_URL = "http://127.0.0.1:8985";

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { db, sqlite, closeDatabase } = await import("../../db/client.js");
const { users } = await import("../../db/schema.js");
const {
  __testing,
  cleanupExpiredAuthSessions,
  createAuthSession,
  renewAuthSession,
  verifyAuthSessionToken
} = await import("./session.service.js");
const user = { id: 1, username: "session-admin", role: "admin" as const, isSuperAdmin: true };

beforeEach(() => {
  __testing.clearRecentRenewals();
  sqlite.exec("DELETE FROM auth_sessions; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('users');");
  const date = new Date();
  db.insert(users).values({ id: user.id, username: user.username, passwordHash: "x", role: "admin", status: "active", createdAt: date, updatedAt: date }).run();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe("auth token rotation", () => {
  test("keeps a continuously active editor session renewable after 90 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));
    try {
      const first = await createAuthSession(user);
      let verified = await verifyAuthSessionToken(first.token);
      for (let minute = 10; minute <= 90; minute += 10) {
        vi.advanceTimersByTime(10 * 60 * 1000);
        verified = await verifyAuthSessionToken(first.token);
      }
      const renewed = await renewAuthSession(verified.sessionId, user, verified.tokenDigest);
      await expect(verifyAuthSessionToken(renewed.token)).resolves.toMatchObject({ sessionId: verified.sessionId });
    } finally {
      vi.useRealTimers();
    }
  });

  test("accepts the rotated token on the next authenticated save request", async () => {
    const first = await createAuthSession(user);
    const verified = await verifyAuthSessionToken(first.token);
    const renewed = await renewAuthSession(verified.sessionId, user, verified.tokenDigest);
    await expect(verifyAuthSessionToken(renewed.token)).resolves.toMatchObject({
      userId: user.id,
      sessionId: verified.sessionId
    });
  });

  test("coalesces concurrent refresh requests into one rotated token", async () => {
    const first = await createAuthSession(user);
    const verified = await verifyAuthSessionToken(first.token);
    const attempts = await Promise.allSettled([
      renewAuthSession(verified.sessionId, user, verified.tokenDigest),
      renewAuthSession(verified.sessionId, user, verified.tokenDigest)
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(2);
    const results = attempts.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof renewAuthSession>>> => item.status === "fulfilled").map((item) => item.value);
    expect(results[0]!.token).toBe(results[1]!.token);
    const renewed = results[0]!;
    expect(renewed.token).not.toBe(first.token);
    await expect(verifyAuthSessionToken(first.token)).resolves.toMatchObject({ sessionId: verified.sessionId });
    await expect(verifyAuthSessionToken(renewed.token)).resolves.toMatchObject({ sessionId: verified.sessionId });
    await expect(renewAuthSession(verified.sessionId, user, verified.tokenDigest)).resolves.toMatchObject({ token: renewed.token });
  });

  test("cleans expired recent renewal entries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));
    try {
      const first = await createAuthSession(user);
      const verified = await verifyAuthSessionToken(first.token);
      await renewAuthSession(verified.sessionId, user, verified.tokenDigest);
      expect(__testing.recentRenewalCount()).toBe(1);

      vi.advanceTimersByTime(30_001);
      await cleanupExpiredAuthSessions();
      expect(__testing.recentRenewalCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
