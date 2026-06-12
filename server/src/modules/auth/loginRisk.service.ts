import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { loginFailures } from "../../db/schema.js";
import { now } from "../../utils/date.js";

export type LoginScope = "admin" | "user";

type LoginRiskInput = {
  username: string;
  scope: LoginScope;
  ip?: string;
};

type LoginRiskPolicy = {
  captchaAt: number;
  firstLockAt: number;
  firstLockMs: number;
  secondLockAt?: number;
  secondLockMs?: number;
};

export type LoginRiskDecision = {
  captchaRequired: boolean;
  lockedUntil?: number;
  waitMs?: number;
  reason?: string;
  failures: number;
};

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = FAILURE_WINDOW_MS;
const USER_POLICY: LoginRiskPolicy = {
  captchaAt: 5,
  firstLockAt: 10,
  firstLockMs: 15 * 60 * 1000,
  secondLockAt: 20,
  secondLockMs: 24 * 60 * 60 * 1000
};
const ADMIN_POLICY: LoginRiskPolicy = {
  captchaAt: 1,
  firstLockAt: 10,
  firstLockMs: 30 * 60 * 1000
};

function policy(scope: LoginScope) {
  return scope === "admin" ? ADMIN_POLICY : USER_POLICY;
}

function normalizedUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizedIp(ip?: string) {
  return (ip || "unknown").trim().slice(0, 191) || "unknown";
}

function dimensions(input: LoginRiskInput) {
  return [
    { dimension: "account" as const, dimensionValue: normalizedUsername(input.username) },
    { dimension: "ip" as const, dimensionValue: normalizedIp(input.ip) }
  ];
}

async function pruneExpiredLoginFailures(timestamp = now()) {
  const cutoff = new Date(timestamp.getTime() - FAILURE_WINDOW_MS);
  await dbRun(db.delete(loginFailures).where(and(
    lt(loginFailures.lastFailedAt, cutoff),
    or(isNull(loginFailures.lockedUntil), lte(loginFailures.lockedUntil, timestamp))
  )));
}

const cleanupTimer = setInterval(() => {
  void pruneExpiredLoginFailures().catch(() => undefined);
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

async function rowsFor(input: LoginRiskInput) {
  await pruneExpiredLoginFailures();
  const username = normalizedUsername(input.username);
  const rows = await dbAll<typeof loginFailures.$inferSelect>(db
    .select()
    .from(loginFailures)
    .where(and(eq(loginFailures.username, username), eq(loginFailures.scope, input.scope))));
  const wanted = new Set(dimensions(input).map((item) => `${item.dimension}:${item.dimensionValue}`));
  return rows.filter((row) => wanted.has(`${row.dimension}:${row.dimensionValue}`));
}

function decisionFromRows(input: LoginRiskInput, rows: Array<typeof loginFailures.$inferSelect>): LoginRiskDecision {
  const currentTime = Date.now();
  const maxFailures = rows.reduce((max, row) => Math.max(max, row.failCount), 0);
  const lockedUntil = rows
    .map((row) => row.lockedUntil?.getTime() ?? 0)
    .filter((value) => value > currentTime)
    .sort((a, b) => b - a)[0];
  if (lockedUntil) {
    return {
      captchaRequired: true,
      lockedUntil,
      waitMs: lockedUntil - currentTime,
      reason: "locked",
      failures: maxFailures
    };
  }
  const currentPolicy = policy(input.scope);
  return {
    captchaRequired: maxFailures >= currentPolicy.captchaAt,
    reason: maxFailures >= currentPolicy.captchaAt ? "failed_password" : undefined,
    failures: maxFailures
  };
}

export async function assessLoginRisk(input: LoginRiskInput): Promise<LoginRiskDecision> {
  return decisionFromRows(input, await rowsFor(input));
}

function lockUntilFor(failCount: number, input: LoginRiskInput) {
  const currentPolicy = policy(input.scope);
  if (currentPolicy.secondLockAt && failCount >= currentPolicy.secondLockAt) {
    return new Date(Date.now() + (currentPolicy.secondLockMs ?? currentPolicy.firstLockMs));
  }
  if (failCount >= currentPolicy.firstLockAt) {
    return new Date(Date.now() + currentPolicy.firstLockMs);
  }
  return null;
}

export async function recordLoginFailure(input: LoginRiskInput): Promise<LoginRiskDecision> {
  await pruneExpiredLoginFailures();
  const username = normalizedUsername(input.username);
  const timestamp = now();
  for (const item of dimensions(input)) {
    const existing = await dbGet<typeof loginFailures.$inferSelect>(db
      .select()
      .from(loginFailures)
      .where(and(
        eq(loginFailures.username, username),
        eq(loginFailures.scope, input.scope),
        eq(loginFailures.dimension, item.dimension),
        eq(loginFailures.dimensionValue, item.dimensionValue)
      ))
      .limit(1));
    const failCount = existing && timestamp.getTime() - existing.firstFailedAt.getTime() <= FAILURE_WINDOW_MS
      ? existing.failCount + 1
      : 1;
    const lockedUntil = lockUntilFor(failCount, input);

    if (existing) {
      await dbRun(db.update(loginFailures).set({
        failCount,
        firstFailedAt: failCount === 1 ? timestamp : existing.firstFailedAt,
        lastFailedAt: timestamp,
        lockedUntil
      }).where(eq(loginFailures.id, existing.id)));
    } else {
      await dbRun(db.insert(loginFailures).values({
        username,
        scope: input.scope,
        dimension: item.dimension,
        dimensionValue: item.dimensionValue,
        failCount,
        firstFailedAt: timestamp,
        lastFailedAt: timestamp,
        lockedUntil
      }));
    }
  }
  return assessLoginRisk(input);
}

export async function recordLoginSuccess(input: LoginRiskInput) {
  await pruneExpiredLoginFailures();
  const username = normalizedUsername(input.username);
  for (const item of dimensions(input)) {
    await dbRun(db.delete(loginFailures).where(and(
      eq(loginFailures.username, username),
      eq(loginFailures.scope, input.scope),
      eq(loginFailures.dimension, item.dimension),
      eq(loginFailures.dimensionValue, item.dimensionValue)
    )));
  }
}
