import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}
