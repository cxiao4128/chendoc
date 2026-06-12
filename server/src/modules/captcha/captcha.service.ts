import { createHash, randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { captchas } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { minutesFromNow, now } from "../../utils/date.js";

function hashCode(id: string, code: string) {
  return createHash("sha256").update(`${id}:${code.toLowerCase()}:${env.jwtSecret}`).digest("hex");
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function createCode() {
  const variant = randomInt(0, 4);

  if (variant === 0) {
    const a = randomInt(18, 80);
    const b = randomInt(11, 100 - a);
    return { question: `${a}+${b}`, answer: String(a + b) };
  }

  if (variant === 1) {
    const a = randomInt(35, 100);
    const b = randomInt(11, a - 9);
    return { question: `${a}-${b}`, answer: String(a - b) };
  }

  if (variant === 2) {
    const a = randomInt(3, 11);
    const b = randomInt(3, 11);
    return { question: `${a}×${b}`, answer: String(a * b) };
  }

  const answer = randomInt(3, 11);
  const divisor = randomInt(3, 11);
  return { question: `${answer * divisor}÷${divisor}`, answer: String(answer) };
}

function createSvg(question: string) {
  const chars = question.split("");
  const step = chars.length > 6 ? 18 : 20;
  const start = Math.max(12, Math.floor((150 - chars.length * step) / 2) + 4);
  const text = chars.map((char, index) => {
    const x = start + index * step;
    const y = 32 + randomInt(-3, 4);
    const rotate = randomInt(-10, 11);
    const fill = index % 3 === 1 ? "#6652d4" : "#24304d";
    return `<text x="${x}" y="${y}" fill="${fill}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }).join("");
  const dots = Array.from({ length: 18 }, () => {
    const cx = randomInt(4, 147);
    const cy = randomInt(4, 45);
    const r = randomInt(1, 2);
    const color = randomInt(0, 2) === 0 ? "#b8a9ff" : "#d9c9ff";
    const opacity = (randomInt(14, 28) / 100).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
  }).join("");
  const marks = Array.from({ length: 6 }, () => {
    const x = randomInt(8, 142);
    const y = randomInt(8, 40);
    const char = randomInt(0, 2) === 0 ? "+" : "×";
    const rotate = randomInt(-20, 21);
    const color = randomInt(0, 2) === 0 ? "#b8a9ff" : "#9ed8e2";
    return `<text x="${x}" y="${y}" fill="${color}" opacity=".24" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }).join("");
  const lines = Array.from({ length: 4 }, (_, index) => {
    const y = 10 + index * 9 + randomInt(-2, 3);
    const c1 = 28 + randomInt(-8, 9);
    const c2 = 72 + randomInt(-10, 11);
    const c3 = 108 + randomInt(-10, 11);
    const stroke = index % 2 === 0 ? "#c8bcff" : "#b9e5ee";
    return `<path d="M3 ${y} C${c1} ${46 - y}, ${c2} ${y - 7}, ${c3} ${y + 8} S138 ${46 - y}, 150 ${y + 2}" stroke="${stroke}" stroke-width="1.15" fill="none" opacity=".28"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="48" viewBox="0 0 150 48" role="img" aria-label="math captcha"><defs><linearGradient id="captcha-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffefe"/><stop offset=".56" stop-color="#f7f3ff"/><stop offset="1" stop-color="#eef8ff"/></linearGradient><radialGradient id="captcha-glow" cx=".25" cy=".22" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity=".82"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><filter id="ink-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation=".45" flood-color="#ffffff" flood-opacity=".95"/></filter></defs><rect width="150" height="48" rx="8" fill="url(#captcha-bg)"/><rect width="150" height="48" rx="8" fill="url(#captcha-glow)"/><path d="M0 42 C24 32 45 43 68 27 S114 7 151 24" stroke="#e0d8ff" stroke-width="7" fill="none" opacity=".34"/><path d="M-2 12 C31 25 55 4 84 15 S124 35 152 18" stroke="#d8f3f7" stroke-width="6" fill="none" opacity=".38"/>${dots}${marks}${lines}<g filter="url(#ink-shadow)" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="24" font-weight="850">${text}</g></svg>`;
}

function timestampFromCaptchaId(captchaId: string) {
  const value = Number(captchaId.split("-", 1)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function createCaptcha() {
  const issuedAt = Date.now();
  const captchaId = `${issuedAt}-${randomUUID()}`;
  const code = createCode();
  const createdAt = new Date(issuedAt);
  await dbRun(db.insert(captchas).values({
    id: captchaId,
    codeHash: hashCode(captchaId, code.answer),
    tryCount: 0,
    expireAt: minutesFromNow(5),
    createdAt
  }));

  return { captchaId, image: svgToDataUri(createSvg(code.question)) };
}

export async function verifyCaptcha(captchaId: string, captchaCode: string) {
  const record = await dbGet<typeof captchas.$inferSelect>(db.select().from(captchas).where(eq(captchas.id, captchaId)).limit(1));
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
  await dbRun(db.update(captchas).set({ tryCount: record.tryCount + 1, usedAt: now() }).where(eq(captchas.id, captchaId)));
  return ok;
}
