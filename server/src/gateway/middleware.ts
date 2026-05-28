import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import {
  type GatewayPacketMeta,
  GatewayPacketError,
  isGatewayEnvelope,
  packGatewayResponse,
  unpackGatewayPacket
} from "./packet.js";

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
  return request.headers["x-gateway-internal"] === "1";
}

function isGatewayBootstrapRequest(request: FastifyRequest) {
  const path = request.url.split("?")[0];
  return path === "/api/crypto/public-key"
    || path === "/api/crypto/challenge"
    || path === "/api/bootstrap";
}

function hasRequestBody(request: FastifyRequest) {
  return request.body !== undefined && request.body !== null;
}

function requirePacket(request: FastifyRequest) {
  return env.nodeEnv === "production"
    && isApiRequest(request)
    && !isInternalGatewayRequest(request)
    && !isGatewayBootstrapRequest(request);
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
  if (isInternalGatewayRequest(request) || isGatewayBootstrapRequest(request)) return;
  if (!isApiRequest(request)) return;
  if (!hasRequestBody(request)) {
    if (requirePacket(request)) {
      return reply.code(400).send({ code: "PACKET_REQUIRED", message: "Invalid gateway packet." });
    }
    return;
  }

  if (isGatewayEnvelope(request.body)) {
    try {
      const decoded = await unpackGatewayPacket(request.body);
      request.packet = decoded.packet;
      request.gatewayAesKey = decoded.aesKey;
      request.body = decoded.body;
      return;
    } catch (error) {
      const code = error instanceof GatewayPacketError ? error.code : "INVALID_PACKET";
      const statusCode = error instanceof GatewayPacketError ? error.statusCode : 400;
      return reply.code(statusCode).send({ code, message: "Invalid gateway packet." });
    }
  }

  if (requirePacket(request)) {
    return reply.code(400).send({ code: "PACKET_REQUIRED", message: "Invalid gateway packet." });
  }
}

export async function packGatewayReply(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  if (env.nodeEnv !== "production" || !isApiRequest(request)) return payload;
  if (isInternalGatewayRequest(request) || isGatewayBootstrapRequest(request)) return payload;
  if (reply.statusCode === 204) return payload;

  const parsed = parseJsonPayload(payload);
  reply.header("Content-Type", "application/json; charset=utf-8");
  return JSON.stringify(packGatewayResponse({
    requestId: request.id,
    statusCode: reply.statusCode,
    payload: parsed,
    aesKey: request.gatewayAesKey
  }));
}
