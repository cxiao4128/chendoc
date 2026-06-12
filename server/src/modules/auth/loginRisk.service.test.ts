import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-login-risk-"));
const testSecret = "x".repeat(32);
const baseTime = new Date("2026-06-13T00:00:00.000Z");
const failureWindowMs = 15 * 60 * 1000;

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

const { closeDatabase, db, dbAll, dbRun } = await import("../../db/client.js");
const { loginFailures } = await import("../../db/schema.js");
const { assessLoginRisk, recordLoginFailure } = await import("./loginRisk.service.js");

type LoginFailureRow = typeof loginFailures.$inferSelect;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(baseTime);
  await dbRun(db.delete(loginFailures));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

async function allFailures() {
  return await dbAll<LoginFailureRow>(db.select().from(loginFailures));
}

async function insertFailure(input: {
  username?: string;
  scope?: "admin" | "user";
  dimension?: "account" | "ip";
  dimensionValue?: string;
  failCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  lockedUntil?: Date | null;
}) {
  await dbRun(db.insert(loginFailures).values({
    username: input.username ?? "writer",
    scope: input.scope ?? "user",
    dimension: input.dimension ?? "account",
    dimensionValue: input.dimensionValue ?? "writer",
    failCount: input.failCount,
    firstFailedAt: input.firstFailedAt,
    lastFailedAt: input.lastFailedAt,
    lockedUntil: input.lockedUntil ?? null
  }));
}

describe("login risk failure pruning", () => {
  test("assessment prunes unlocked failures older than 15 minutes", async () => {
    const expiredAt = new Date(baseTime.getTime() - failureWindowMs - 1);
    await insertFailure({
      failCount: 6,
      firstFailedAt: expiredAt,
      lastFailedAt: expiredAt
    });

    const decision = await assessLoginRisk({ username: "Writer", scope: "user", ip: "10.0.0.1" });

    expect(decision).toEqual({ captchaRequired: false, failures: 0 });
    expect(await allFailures()).toHaveLength(0);
  });

  test("assessment keeps active locks after the failure window", async () => {
    const expiredAt = new Date(baseTime.getTime() - failureWindowMs - 1);
    const lockedUntil = new Date(baseTime.getTime() + 30 * 60 * 1000);
    await insertFailure({
      scope: "admin",
      failCount: 10,
      firstFailedAt: expiredAt,
      lastFailedAt: expiredAt,
      lockedUntil
    });

    const decision = await assessLoginRisk({ username: "writer", scope: "admin", ip: "10.0.0.1" });

    expect(decision.reason).toBe("locked");
    expect(decision.lockedUntil).toBe(lockedUntil.getTime());
    expect(await allFailures()).toHaveLength(1);
  });

  test("failure counts reset after the 15 minute window", async () => {
    const input = { username: "writer", scope: "user" as const, ip: "10.0.0.1" };
    let decision = await recordLoginFailure(input);
    for (let index = 1; index < 5; index += 1) {
      decision = await recordLoginFailure(input);
    }

    expect(decision.failures).toBe(5);
    expect(decision.captchaRequired).toBe(true);
    expect(decision.reason).toBe("failed_password");

    vi.setSystemTime(new Date(baseTime.getTime() + failureWindowMs + 1));
    const resetDecision = await recordLoginFailure(input);
    const rows = await allFailures();

    expect(resetDecision).toEqual({ captchaRequired: false, failures: 1 });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.failCount === 1)).toBe(true);
  });
});
