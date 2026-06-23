import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import {
  type GatewayPacketMeta,
  GatewayPacketError,
  isGatewayEnvelope,
  packGatewayResponse,
  unpackGatewayPacket
} from "./packet.js";
import { isGatewayExemptPath } from "./action-registry.js";
import { measureRequestPhase } from "../utils/requestTiming.js";
import { isVerifiedInternalGatewayRequest } from "./internal-request.js";

const GATEWAY_DEBUG = env.nodeEnv !== "production";

declare module "fastify" {
  interface FastifyRequest {
    packet?: GatewayPacketMeta;
    gatewayAesKey?: Buffer;
  }
}

function isApiRequest(request: FastifyRequest) {
  return request.url.startsWith("/api/");
}

function isInternalGatewayRequest(request: FastifyRequest) {
  return isVerifiedInternalGatewayRequest(request);
}

function requestPath(request: FastifyRequest) {
  return request.url.split("?")[0]!;
}

function isGatewayExemptRequest(request: FastifyRequest) {
  return isGatewayExemptPath(requestPath(request));
}

function isGatewayEntryRequest(request: FastifyRequest) {
  return requestPath(request) === "/api/gateway";
}

function hasRequestBody(request: FastifyRequest) {
  return request.body !== undefined && request.body !== null;
}

function requirePacket(request: FastifyRequest) {
  // Gateway validates packet integrity/replay only. Route preHandlers still own authz.
  return env.nodeEnv === "production"
    && isApiRequest(request)
    && !isInternalGatewayRequest(request)
    && (!isGatewayExemptRequest(request) || isGatewayEntryRequest(request));
}

function parseJsonPayload(payload: unknown) {
  if (Buffer.isBuffer(payload)) payload = payload.toString("utf8");
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

export async function unpackGatewayRequest(request: FastifyRequest, reply: FastifyReply) {
  const isInternal = isInternalGatewayRequest(request);
  const isExempt = isGatewayExemptRequest(request);
  if (GATEWAY_DEBUG) console.log(`[gateway] unpackGatewayRequest: ${request.method} ${request.url}, isExempt=${isExempt}, isInternal=${isInternal}`);
  if (isInternal || !isApiRequest(request)) return;

  if (hasRequestBody(request) && isGatewayEnvelope(request.body)) {
    try {
      const fingerprint = Array.isArray(request.headers["x-client-fingerprint"])
        ? request.headers["x-client-fingerprint"][0]
        : request.headers["x-client-fingerprint"];
      const decoded = await measureRequestPhase("gatewayUnpack", () => unpackGatewayPacket(request.body, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
        fingerprint
      }));
      request.packet = decoded.packet;
      request.gatewayAesKey = decoded.aesKey;
      request.body = decoded.body;
      return;
    } catch (error) {
      const code = error instanceof GatewayPacketError ? error.code : "INVALID_PACKET";
      const statusCode = error instanceof GatewayPacketError ? error.statusCode : 400;
      if (GATEWAY_DEBUG) console.log(`[gateway] INVALID_PACKET for ${request.method} ${request.url}:`, error);
      return reply.code(statusCode).send({ code, message: "Invalid gateway packet." });
    }
  }

  if (requirePacket(request)) {
    if (GATEWAY_DEBUG) console.log(`[gateway] PACKET_REQUIRED (no envelope) for ${request.method} ${request.url}`);
    return reply.code(400).send({ code: "PACKET_REQUIRED", message: "Invalid gateway packet." });
  }
}

export async function packGatewayReply(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  if (!isApiRequest(request)) return payload;
  const isInternal = isInternalGatewayRequest(request);
  const isExempt = isGatewayExemptRequest(request);
  if (GATEWAY_DEBUG) console.log(`[gateway] packGatewayReply: ${request.url}, nodeEnv=${env.nodeEnv}, isExempt=${isExempt}, isInternal=${isInternal}`);
  if (isInternal) return payload;
  if (reply.statusCode === 204) return payload;
  if (!request.gatewayAesKey && isExempt) return payload;
  if (env.nodeEnv !== "production" && !request.gatewayAesKey) return payload;

  const parsed = parseJsonPayload(payload);
  reply.header("Content-Type", "application/json; charset=utf-8");
  return JSON.stringify(packGatewayResponse({
    requestId: request.id,
    statusCode: reply.statusCode,
    payload: parsed,
    aesKey: request.gatewayAesKey
  }));
}
