import type { FastifyRequest } from "fastify";
import { enqueueLog, logMetaFromRequest, type AsyncLogType } from "./asyncLogQueue.js";

export interface AuditMeta {
  userId?: number | null;
  username?: string | null;
  role?: string | null;
  action: string;
  targetType: string;
  targetId: string | number;
  result?: "success" | "failure" | "denied";
  riskLevel?: "low" | "medium" | "high" | "critical";
  detail?: unknown;
  ip?: string;
  userAgent?: string | string[];
  path?: string;
  method?: string;
  statusCode?: number;
}

export function auditMetaFromRequest(request: FastifyRequest) {
  return logMetaFromRequest(request);
}

function typeForAudit(input: AuditMeta): AsyncLogType {
  if (input.action.startsWith("auth.login")) return "login_log";
  if (input.result === "denied") return "security_log";
  if (input.riskLevel === "high" || input.riskLevel === "critical") return "security_log";
  if (input.action.startsWith("auth.totp") || input.action.startsWith("admin.danger")) return "security_log";
  return "operation_log";
}

function statusCodeForAudit(input: AuditMeta) {
  if (input.statusCode) return input.statusCode;
  if (input.result === "denied") return 403;
  if (input.result === "failure" || input.action.includes(".failure")) return 400;
  return 200;
}

export function writeAuditLog(input: AuditMeta) {
  enqueueLog({
    type: typeForAudit(input),
    userId: input.userId ?? null,
    role: input.role ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: String(input.targetId),
    ip: input.ip,
    userAgent: Array.isArray(input.userAgent) ? input.userAgent.join(", ") : input.userAgent,
    path: input.path,
    method: input.method,
    statusCode: statusCodeForAudit(input),
    message: input.result ?? (input.action.includes(".failure") ? "failure" : "success"),
    data: input.detail === undefined ? undefined : { detail: input.detail, riskLevel: input.riskLevel ?? "low" }
  });
}
