import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "./env.js";

export interface JwtUser {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
  sessionId?: string;
  jti?: string;
  exp?: number;
  iat?: number;
}

export function signJwt(user: Omit<JwtUser, "exp" | "iat" | "jti">, sessionId: string) {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
    jwtid: sessionId
  };
  return jwt.sign({ ...user, sessionId }, env.jwtSecret, options);
}

export function verifyJwt(token: string) {
  const payload = jwt.verify(token, env.jwtSecret) as JwtUser;
  const sessionId = payload.jti || payload.sessionId;
  if (!sessionId) throw new Error("Invalid JWT session.");
  return { ...payload, sessionId, jti: sessionId };
}

export function jwtExpiresAt(token: string) {
  const decoded = jwt.decode(token) as JwtUser | null;
  return decoded?.exp ? new Date(decoded.exp * 1000) : null;
}
