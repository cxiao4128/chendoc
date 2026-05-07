import { createHash, randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { captchas } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { minutesFromNow, now } from "../../utils/date.js";

function hashCode(id: string, code: string) {
  return createHash("sha256").update(`${id}:${code.toLowerCase()}:${env.jwtSecret}`).digest("hex");
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function randomChar(chars: string) {
  return chars[randomInt(0, chars.length)];
}

function shuffle(value: string[]) {
  for (let index = value.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    [value[index], value[swapIndex]] = [value[swapIndex], value[index]];
  }
  return value;
}

function createCode() {
  const digits = "23456789";
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const alphabet = `${digits}${letters}`;
  const chars = [randomChar(digits), randomChar(letters)];
  while (chars.length < 5) chars.push(randomChar(alphabet));
  return shuffle(chars).join("");
}

function createSvg(code: string) {
  const chars = code.split("");
  const text = chars.map((char, index) => {
    const x = 17 + index * 26;
    const y = 35 + randomInt(-3, 4);
    const rotate = randomInt(-10, 11);
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }).join("");
  const dots = Array.from({ length: 22 }, () => {
    const cx = randomInt(8, 143);
    const cy = randomInt(7, 42);
    const r = randomInt(1, 3);
    const opacity = (randomInt(18, 38) / 100).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#7aa2ff" opacity="${opacity}"/>`;
  }).join("");
  const slices = Array.from({ length: 4 }, (_, index) => {
    const y = 12 + index * 8 + randomInt(-3, 4);
    const c1 = 26 + randomInt(-6, 7);
    const c2 = 68 + randomInt(-8, 9);
    const c3 = 108 + randomInt(-8, 9);
    const end = 144 + randomInt(-4, 5);
    const stroke = index % 2 === 0 ? "#4578ff" : "#7ed8c8";
    return `<path d="M6 ${y} C${c1} ${48 - y}, ${c2} ${y - 8}, ${c3} ${y + 10} S${end} ${48 - y}, 148 ${y + 2}" stroke="${stroke}" stroke-width="1.4" fill="none" opacity=".34"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="48" viewBox="0 0 150 48" role="img" aria-label="captcha"><defs><linearGradient id="captcha-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#edf6ff"/><stop offset=".52" stop-color="#ffffff"/><stop offset="1" stop-color="#e9fff9"/></linearGradient><filter id="ink-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation=".7" flood-color="#ffffff" flood-opacity=".95"/></filter></defs><rect width="150" height="48" rx="12" fill="url(#captcha-bg)"/><path d="M0 42 C31 28 42 44 72 26 S119 8 150 23" stroke="#cfe0ff" stroke-width="9" fill="none" opacity=".46"/><path d="M-2 10 C28 24 55 4 84 15 S124 35 152 18" stroke="#c8f4ec" stroke-width="7" fill="none" opacity=".5"/>${dots}${slices}<g fill="#18233f" filter="url(#ink-shadow)" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="25" font-weight="850" letter-spacing="1">${text}</g></svg>`;
}

function timestampFromCaptchaId(captchaId: string) {
  const value = Number(captchaId.split("-", 1)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function createCaptcha() {
  const issuedAt = Date.now();
  const captchaId = `${issuedAt}-${randomUUID()}`;
  const code = createCode();
  const createdAt = new Date(issuedAt);
  db.insert(captchas).values({
    id: captchaId,
    codeHash: hashCode(captchaId, code),
    tryCount: 0,
    expireAt: minutesFromNow(5),
    createdAt
  }).run();

  return { captchaId, image: svgToDataUri(createSvg(code)) };
}

export function verifyCaptcha(captchaId: string, captchaCode: string) {
  const record = db.select().from(captchas).where(eq(captchas.id, captchaId)).limit(1).get();
  const issuedAt = timestampFromCaptchaId(captchaId);
  if (
    !record ||
    !issuedAt ||
    Math.abs(record.createdAt.getTime() - issuedAt) > 30 * 1000 ||
    record.usedAt ||
    record.expireAt.getTime() < Date.now() ||
    record.tryCount >= 5
  ) {
    return false;
  }

  const ok = record.codeHash === hashCode(captchaId, captchaCode.trim());
  db.update(captchas).set({ tryCount: record.tryCount + 1, usedAt: now() }).where(eq(captchas.id, captchaId)).run();
  return ok;
}
