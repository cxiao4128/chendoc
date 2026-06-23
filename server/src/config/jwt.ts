import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

export interface JwtUser {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
  sessionId?: string;
  sessionTokenDigest?: string;
  tokenNonce?: string;
  jti?: string;
  exp?: number;
  iat?: number;
}

export function signJwt(user: Omit<JwtUser, "exp" | "iat" | "jti">, sessionId: string) {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
    jwtid: sessionId,
    audience: "chendoc-admin",
    issuer: "chendoc"
  };
  return jwt.sign({ ...user, sessionId, tokenNonce: randomUUID() }, env.jwtSecret, options);
}

export function verifyJwt(token: string) {
  const payload = jwt.verify(token, env.jwtSecret, { audience: "chendoc-admin", issuer: "chendoc" }) as JwtUser;
  const sessionId = payload.jti || payload.sessionId;
  if (!sessionId) throw new Error("Invalid JWT session.");
  return { ...payload, sessionId, jti: sessionId };
}

export function jwtExpiresAt(token: string) {
  const decoded = jwt.decode(token) as JwtUser | null;
  return decoded?.exp ? new Date(decoded.exp * 1000) : null;
}
