import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db, dbGet, dbRun } from "../db/client.js";
import { auditLogs, operationLogs, users } from "../db/schema.js";
import { now } from "./date.js";
import { redactSensitive } from "./redact.js";

export interface AuditMeta {
  userId?: number | null;
  username?: string | null;
  action: string;
  targetType: string;
  targetId: string | number;
  result?: "success" | "failure" | "denied";
  riskLevel?: "low" | "medium" | "high" | "critical";
  detail?: unknown;
  ip?: string;
  userAgent?: string | string[];
}

export function auditMetaFromRequest(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers["user-agent"]
  };
}

export async function writeAuditLog(input: AuditMeta) {
  const username = input.username ?? (input.userId
    ? (await dbGet<{ username: string }>(db.select({ username: users.username }).from(users).where(eq(users.id, input.userId)).limit(1)))?.username ?? null
    : null);

  await dbRun(db.insert(operationLogs).values({
    userId: input.userId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: String(input.targetId),
    ip: input.ip,
    userAgent: Array.isArray(input.userAgent) ? input.userAgent.join(", ") : input.userAgent,
    createdAt: now()
  }));

  await dbRun(db.insert(auditLogs).values({
    userId: input.userId ?? null,
    username,
    action: input.action,
    result: input.result ?? (input.action.includes(".failure") ? "failure" : "success"),
    ip: input.ip,
    userAgent: Array.isArray(input.userAgent) ? input.userAgent.join(", ") : input.userAgent,
    riskLevel: input.riskLevel ?? "low",
    detail: input.detail === undefined ? null : JSON.stringify(redactSensitive(input.detail)),
    createdAt: now()
  }));
}
