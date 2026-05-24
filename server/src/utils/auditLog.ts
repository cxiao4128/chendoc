import type { FastifyRequest } from "fastify";
import { db, dbRun } from "../db/client.js";
import { operationLogs } from "../db/schema.js";
import { now } from "./date.js";

export interface AuditMeta {
  userId?: number | null;
  action: string;
  targetType: string;
  targetId: string | number;
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
  await dbRun(db.insert(operationLogs).values({
    userId: input.userId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: String(input.targetId),
    ip: input.ip,
    userAgent: Array.isArray(input.userAgent) ? input.userAgent.join(", ") : input.userAgent,
    createdAt: now()
  }));
}
