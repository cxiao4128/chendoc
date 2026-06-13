import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { enqueueErrorLog, enqueueSecurityLog, logMetaFromRequest } from "../utils/asyncLogQueue.js";
import { AppError } from "../utils/errors.js";

type ErrorPayload = {
  statusCode: number;
  code: string;
  message: string;
  issues?: string[];
  stack?: string;
};

function statusCodeOf(error: FastifyError | AppError) {
  const statusCode = Number(error.statusCode);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

function codeOf(error: FastifyError | AppError, statusCode: number) {
  if (typeof error.code === "string" && error.code) return error.code;
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  return "INTERNAL_SERVER_ERROR";
}

function shouldExposeMessage(error: FastifyError | AppError, statusCode: number) {
  if (error instanceof AppError) return error.expose;
  return statusCode < 500;
}

function payloadFor(error: FastifyError | AppError): ErrorPayload {
  const statusCode = statusCodeOf(error);
  const code = codeOf(error, statusCode);
  const exposeMessage = shouldExposeMessage(error, statusCode);
  const payload: ErrorPayload = {
    statusCode,
    code,
    message: exposeMessage || env.nodeEnv !== "production" ? error.message : "服务暂时不可用"
  };

  if (env.nodeEnv !== "production" && error.stack) payload.stack = error.stack;
  return payload;
}

function zodPayload(error: ZodError): ErrorPayload {
  const payload: ErrorPayload = {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "请求参数不正确",
    issues: error.issues.map((item) => item.path.join("."))
  };
  if (env.nodeEnv !== "production" && error.stack) payload.stack = error.stack;
  return payload;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const payload = error instanceof ZodError ? zodPayload(error) : payloadFor(error);
    const meta = logMetaFromRequest(request);
    if (payload.statusCode === 403) {
      enqueueSecurityLog({
        ...meta,
        userId: request.user?.id ?? null,
        role: request.user?.role ?? meta.role ?? null,
        action: "request.forbidden",
        targetType: "request",
        targetId: request.url,
        statusCode: payload.statusCode,
        message: payload.code,
        data: { code: payload.code, actionCode: request.packet?.actionCode }
      });
    } else if (payload.statusCode >= 500) {
      enqueueErrorLog({
        ...meta,
        userId: request.user?.id ?? null,
        role: request.user?.role ?? meta.role ?? null,
        action: "request.error",
        targetType: "request",
        targetId: request.url,
        statusCode: payload.statusCode,
        message: error.message,
        data: {
          code: payload.code,
          name: error.name,
          stack: env.nodeEnv !== "production" ? error.stack : undefined,
          actionCode: request.packet?.actionCode
        }
      });
    }
    request.log.error({
      err: error,
      requestId: request.id,
      actionCode: request.packet?.actionCode,
      statusCode: payload.statusCode,
      code: payload.code,
      url: env.nodeEnv !== "production" ? request.url : undefined
    }, "request failed");

    return reply.code(payload.statusCode).send(payload);
  });
}
