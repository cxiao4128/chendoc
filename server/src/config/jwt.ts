import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "./env.js";

export interface JwtUser {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
}

export function signJwt(user: JwtUser) {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign(user, env.jwtSecret, options);
}

export function verifyJwt(token: string) {
  return jwt.verify(token, env.jwtSecret) as JwtUser;
}
