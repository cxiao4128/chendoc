import { randomBytes } from "node:crypto";

const BRAND_CHARS = ["X", "C", "H", "E", "N"] as const;
const DOC_UID_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DOC_UID_PATTERN = /^[A-Za-z0-9]{16,32}$/;

function clampLength(length: number) {
  if (!Number.isFinite(length)) return 24;
  return Math.min(32, Math.max(16, Math.floor(length)));
}

function secureRandomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 256) {
    throw new Error("Invalid random range.");
  }
  const limit = 256 - (256 % maxExclusive);
  while (true) {
    const value = randomBytes(1)[0]!;
    if (value < limit) return value % maxExclusive;
  }
}

function secureShuffle(chars: string[]) {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex]!, chars[index]!];
  }
}

export function isValidDocUid(value: string) {
  return DOC_UID_PATTERN.test(value) && BRAND_CHARS.every((char) => value.includes(char));
}

export function generateDocUid(length = 24) {
  const finalLength = clampLength(length);
  const randomCount = finalLength - BRAND_CHARS.length;
  const chars: string[] = [];

  for (let index = 0; index < randomCount; index += 1) {
    chars.push(DOC_UID_POOL[secureRandomInt(DOC_UID_POOL.length)]!);
  }

  for (const char of BRAND_CHARS) {
    chars.splice(secureRandomInt(chars.length + 1), 0, char);
  }
  secureShuffle(chars);

  const uid = chars.join("");
  if (!DOC_UID_PATTERN.test(uid)) throw new Error("Generated invalid doc_uid.");
  return uid;
}
