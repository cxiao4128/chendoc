import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { db, dbRun } from "../db/client.js";
import { logs } from "../db/schema.js";
import { now } from "./date.js";
import { clientIpFromRequest } from "./requestIp.js";

export type AsyncLogType =
  | "login_log"
  | "operation_log"
  | "security_log"
  | "error_log"
  | "document_log";

export type DocumentLogAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "restore"
  | "share"
  | "search";

export type AsyncLogInput = {
  type: AsyncLogType;
  logUid?: string;
  userId?: number | null;
  role?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  docUid?: string | null;
  ownerId?: number | null;
  ip?: string | null;
  userAgent?: string | string[] | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  message?: string | null;
  data?: unknown;
  createdAt?: Date;
};

export type AsyncLogRecord = Required<Pick<AsyncLogInput, "type" | "action">> & {
  logUid: string;
  userId: number | null;
  role: string | null;
  targetType: string;
  targetId: string;
  docUid: string | null;
  ownerId: number | null;
  ip: string | null;
  userAgent: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  message: string;
  data: string | null;
  createdAt: Date;
};

type QueueStats = {
  queued: number;
  protectedOverflow: number;
  droppedOperationLogs: number;
  droppedOtherLogs: number;
  failedWrites: number;
};

const MAX_QUEUE_SIZE = 5000;
const MAX_BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 1000;
const MAX_WRITE_ATTEMPTS = 3;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_DATA_LENGTH = 16 * 1024;
const REDACTED = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "secret",
  "captcha",
  "accesstoken",
  "refreshtoken"
]);

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return SENSITIVE_KEYS.has(normalized)
    || normalized.includes("password")
    || normalized.includes("token")
    || normalized.includes("authorization")
    || normalized.includes("secret")
    || normalized.includes("captcha");
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function sanitizeLogData<T>(input: T, depth = 0, seen = new WeakSet<object>()): T {
  if (input === null || input === undefined) return input;
  if (depth > 8) return REDACTED as T;
  if (typeof input === "string") {
    if (/^Bearer\s+/i.test(input)) return "Bearer [redacted]" as T;
    return input;
  }
  if (typeof input !== "object") return input;
  if (input instanceof Date) return input.toISOString() as T;
  if (seen.has(input)) return REDACTED as T;
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item, depth + 1, seen)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : sanitizeLogData(value, depth + 1, seen);
  }
  return output as T;
}

function safeJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return truncate(JSON.stringify(sanitizeLogData(value)), MAX_DATA_LENGTH);
  } catch {
    return JSON.stringify({ value: REDACTED });
  }
}

function normalizeUserAgent(value: string | string[] | null | undefined) {
  if (!value) return null;
  return truncate(Array.isArray(value) ? value.join(", ") : value, 512);
}

function normalizeLog(input: AsyncLogInput): AsyncLogRecord {
  const sanitized = sanitizeLogData(input);
  return {
    logUid: sanitized.logUid || randomUUID(),
    type: sanitized.type,
    userId: sanitized.userId ?? null,
    role: sanitized.role ?? null,
    action: truncate(String(sanitized.action), 96),
    targetType: truncate(String(sanitized.targetType ?? (sanitized.type === "document_log" ? "doc" : "system")), 64),
    targetId: truncate(String(sanitized.targetId ?? sanitized.docUid ?? ""), 191),
    docUid: sanitized.docUid ? truncate(String(sanitized.docUid), 32) : null,
    ownerId: sanitized.ownerId ?? null,
    ip: sanitized.ip ? truncate(String(sanitized.ip), 64) : null,
    userAgent: normalizeUserAgent(sanitized.userAgent),
    path: sanitized.path ? truncate(String(sanitized.path), 512) : null,
    method: sanitized.method ? truncate(String(sanitized.method).toUpperCase(), 16) : null,
    statusCode: Number.isInteger(sanitized.statusCode) ? sanitized.statusCode! : null,
    message: truncate(String(sanitized.message ?? ""), MAX_MESSAGE_LENGTH),
    data: safeJson(sanitized.data),
    createdAt: sanitized.createdAt ?? now()
  };
}

function failedLogPath(date = new Date()) {
  const yyyyMmDd = date.toISOString().slice(0, 10);
  return join(env.paths.projectRoot, "logs", `failed-log-${yyyyMmDd}.jsonl`);
}

function isProtectedType(type: AsyncLogType) {
  return type === "error_log" || type === "security_log";
}

export class AsyncLogQueue {
  private queue: AsyncLogRecord[] = [];
  private protectedOverflow: AsyncLogRecord[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private droppedOperationLogs = 0;
  private droppedOtherLogs = 0;
  private failedWrites = 0;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush().catch(() => undefined);
    }, FLUSH_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  enqueueLog(input: AsyncLogInput) {
    const log = normalizeLog(input);
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const operationIndex = this.queue.findIndex((item) => item.type === "operation_log");
      if (operationIndex >= 0) {
        this.queue.splice(operationIndex, 1);
        this.droppedOperationLogs += 1;
      } else if (isProtectedType(log.type)) {
        this.protectedOverflow.push(log);
        void this.flush().catch(() => undefined);
        return true;
      } else {
        this.droppedOtherLogs += 1;
        return false;
      }
    }

    this.queue.push(log);
    return true;
  }

  async flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  stats(): QueueStats {
    return {
      queued: this.queue.length,
      protectedOverflow: this.protectedOverflow.length,
      droppedOperationLogs: this.droppedOperationLogs,
      droppedOtherLogs: this.droppedOtherLogs,
      failedWrites: this.failedWrites
    };
  }

  private nextBatch() {
    const batch: AsyncLogRecord[] = [];
    while (batch.length < MAX_BATCH_SIZE && this.protectedOverflow.length) {
      batch.push(this.protectedOverflow.shift()!);
    }
    while (batch.length < MAX_BATCH_SIZE && this.queue.length) {
      batch.push(this.queue.shift()!);
    }
    return batch;
  }

  private async drain() {
    while (this.queue.length || this.protectedOverflow.length) {
      const batch = this.nextBatch();
      await this.writeBatchWithRetry(batch);
    }
  }

  private async writeBatchWithRetry(batch: AsyncLogRecord[]) {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        await dbRun(db.insert(logs).values(batch));
        return;
      } catch (error) {
        if (attempt === MAX_WRITE_ATTEMPTS) {
          this.failedWrites += batch.length;
          await this.writeFailedLogs(batch, error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
      }
    }
  }

  private async writeFailedLogs(batch: AsyncLogRecord[], error: unknown) {
    const target = failedLogPath();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lines = batch.map((log) => JSON.stringify({
      failedAt: now().toISOString(),
      error: errorMessage,
      log
    })).join("\n") + "\n";
    try {
      await mkdir(join(env.paths.projectRoot, "logs"), { recursive: true });
      await appendFile(target, lines, "utf8");
    } catch (fileError) {
      console.error("async log fallback write failed", fileError);
    }
  }
}

export const asyncLogQueue = new AsyncLogQueue();
asyncLogQueue.start();

export function enqueueLog(log: AsyncLogInput) {
  return asyncLogQueue.enqueueLog(log);
}

export function logMetaFromRequest(request: FastifyRequest) {
  return {
    ip: clientIpFromRequest(request),
    userAgent: request.headers["user-agent"],
    path: request.url,
    method: request.method,
    role: request.user?.role ?? null
  };
}

export function enqueueSecurityLog(input: Omit<AsyncLogInput, "type">) {
  return enqueueLog({ ...input, type: "security_log" });
}

export function enqueueErrorLog(input: Omit<AsyncLogInput, "type">) {
  return enqueueLog({ ...input, type: "error_log" });
}

export function enqueueDocumentLog(input: {
  userId?: number | null;
  role?: string | null;
  docUid?: string | null;
  ownerId?: number | null;
  action: DocumentLogAction;
  request?: FastifyRequest;
  statusCode?: number | null;
}) {
  const meta = input.request ? logMetaFromRequest(input.request) : null;
  return enqueueLog({
    type: "document_log",
    ...(meta ?? {}),
    userId: input.userId ?? null,
    role: input.role ?? meta?.role ?? null,
    action: input.action,
    targetType: "doc",
    targetId: input.docUid ?? "",
    docUid: input.docUid ?? null,
    ownerId: input.ownerId ?? null,
    statusCode: input.statusCode ?? 200,
    message: ""
  });
}

export async function flushAsyncLogQueue() {
  await asyncLogQueue.flush();
}

export async function shutdownAsyncLogQueue() {
  asyncLogQueue.stop();
  await asyncLogQueue.flush();
}
