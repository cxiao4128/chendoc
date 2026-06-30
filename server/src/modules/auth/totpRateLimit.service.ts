import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { totpFailures } from "../../db/schema.js";
import { now } from "../../utils/date.js";

export type TotpScope = "totp" | "recovery";

type TotpRiskInput = {
  userId: number;
  username?: string;
  ip?: string;
};

type TotpRiskPolicy = {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
};

export type TotpRiskDecision = {
  allowed: boolean;
  lockedUntil?: number;
  waitMs?: number;
  reason?: string;
  attempts: number;
  remaining: number;
};

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = ATTEMPT_WINDOW_MS;
const TOTP_POLICY: TotpRiskPolicy = {
  maxAttempts: 10,
  windowMs: ATTEMPT_WINDOW_MS,
  lockMs: 15 * 60 * 1000
};
const RECOVERY_POLICY: TotpRiskPolicy = {
  maxAttempts: 5,
  windowMs: ATTEMPT_WINDOW_MS,
  lockMs: 60 * 60 * 1000
};

function policy(scope: TotpScope) {
  return scope === "totp" ? TOTP_POLICY : RECOVERY_POLICY;
}

function normalizedIp(ip?: string) {
  return (ip || "unknown").trim().slice(0, 191) || "unknown";
}

type Dimension = { dimension: "account" | "ip"; dimensionValue: string };

function dimensions(input: TotpRiskInput, scope: TotpScope): Dimension[] {
  const dims: Dimension[] = [{ dimension: "account", dimensionValue: String(input.userId) }];
  if (input.ip) {
    dims.push({ dimension: "ip", dimensionValue: normalizedIp(input.ip) });
  }
  return dims;
}

async function pruneExpiredTotpFailures(timestamp = now()) {
  const cutoff = new Date(timestamp.getTime() - ATTEMPT_WINDOW_MS);
  await dbRun(db.delete(totpFailures).where(and(
    lt(totpFailures.lastFailedAt, cutoff),
    or(isNull(totpFailures.lockedUntil), lte(totpFailures.lockedUntil, timestamp))
  )));
}

const cleanupTimer = setInterval(() => {
  void pruneExpiredTotpFailures().catch(() => undefined);
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

async function rowsFor(input: TotpRiskInput, scope: TotpScope) {
  await pruneExpiredTotpFailures();
  const rows = await dbAll<typeof totpFailures.$inferSelect>(db
    .select()
    .from(totpFailures)
    .where(and(eq(totpFailures.userId, input.userId))));
  const wanted = new Set(dimensions(input, scope).map((item) => `${item.dimension}:${item.dimensionValue}`));
  return rows.filter((row) => wanted.has(`${row.dimension}:${row.dimensionValue}`));
}

function decisionFromRows(input: TotpRiskInput, scope: TotpScope, rows: Array<typeof totpFailures.$inferSelect>): TotpRiskDecision {
  const currentTime = Date.now();
  const currentPolicy = policy(scope);
  const maxAttempts = rows.reduce((max, row) => Math.max(max, row.failCount), 0);
  const lockedUntil = rows
    .map((row) => row.lockedUntil?.getTime() ?? 0)
    .filter((value) => value > currentTime)
    .sort((a, b) => b - a)[0];

  if (lockedUntil) {
    return {
      allowed: false,
      lockedUntil,
      waitMs: lockedUntil - currentTime,
      reason: "locked",
      attempts: maxAttempts,
      remaining: 0
    };
  }

  const remaining = Math.max(0, currentPolicy.maxAttempts - maxAttempts);
  return {
    allowed: remaining > 0,
    attempts: maxAttempts,
    remaining,
    reason: remaining === 0 ? "exhausted" : undefined
  };
}

export async function assessTotpRisk(input: TotpRiskInput, scope: TotpScope = "totp"): Promise<TotpRiskDecision> {
  return decisionFromRows(input, scope, await rowsFor(input, scope));
}

export async function recordTotpFailure(input: TotpRiskInput, scope: TotpScope = "totp"): Promise<TotpRiskDecision> {
  await pruneExpiredTotpFailures();
  const timestamp = now();
  const currentPolicy = policy(scope);

  for (const item of dimensions(input, scope)) {
    const existing = await dbGet<typeof totpFailures.$inferSelect>(db
      .select()
      .from(totpFailures)
      .where(and(
        eq(totpFailures.userId, input.userId),
        eq(totpFailures.dimension, item.dimension),
        eq(totpFailures.dimensionValue, item.dimensionValue)
      ))
      .limit(1));

    const failCount = existing && timestamp.getTime() - existing.firstFailedAt.getTime() <= currentPolicy.windowMs
      ? existing.failCount + 1
      : 1;

    const lockedUntil = failCount >= currentPolicy.maxAttempts
      ? new Date(Date.now() + currentPolicy.lockMs)
      : null;

    if (existing) {
      await dbRun(db.update(totpFailures).set({
        failCount,
        firstFailedAt: failCount === 1 ? timestamp : existing.firstFailedAt,
        lastFailedAt: timestamp,
        lockedUntil
      }).where(eq(totpFailures.id, existing.id)));
    } else {
      await dbRun(db.insert(totpFailures).values({
        userId: input.userId,
        dimension: item.dimension,
        dimensionValue: item.dimensionValue,
        failCount,
        firstFailedAt: timestamp,
        lastFailedAt: timestamp,
        lockedUntil
      }));
    }
  }

  return assessTotpRisk(input, scope);
}

export async function clearTotpFailures(userId: number) {
  await dbRun(db.delete(totpFailures).where(eq(totpFailures.userId, userId)));
}