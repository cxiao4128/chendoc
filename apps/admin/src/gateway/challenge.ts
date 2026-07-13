import type { ChallengeBox } from "./types";

export function readTime(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return 0;
}

export function pickChallenge(input: unknown): ChallengeBox | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row.nonce !== "string" || !row.nonce) return null;
  const expireAt = readTime(row.expireAt);
  if (!expireAt || expireAt <= Date.now()) return null;
  return {
    value: {
      nonce: row.nonce,
      issuedAt: typeof row.issuedAt === "number" || typeof row.issuedAt === "string" ? row.issuedAt : Date.now(),
      expireAt: typeof row.expireAt === "number" || typeof row.expireAt === "string" ? row.expireAt : expireAt,
      mode: typeof row.mode === "string" ? row.mode : undefined
    },
    expireAt
  };
}
