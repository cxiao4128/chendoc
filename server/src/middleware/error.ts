import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { env } from "../config/env.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ message: "请求参数不正确", issues: error.issues.map((item) => item.path.join(".")) });
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (env.nodeEnv === "production") {
      request.log.error({
        requestId: request.id,
        path: request.url.split("?")[0],
        status: statusCode,
        errorCode: error.code || error.name || "REQUEST_FAILED"
      }, "request failed");
    } else {
      request.log.error({ err: error, url: request.url }, "request failed");
    }
    return reply.code(statusCode).send({
      message: statusCode >= 500 ? "服务暂时不可用" : error.message
    });
  });
}
