import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

const internalGatewayToken = randomBytes(32).toString("base64url");

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function internalGatewayHeaders() {
  return {
    "x-gateway-internal": "1",
    "x-gateway-internal-token": internalGatewayToken
  };
}

export function isVerifiedInternalGatewayRequest(request: FastifyRequest) {
  if (firstHeader(request.headers["x-gateway-internal"]) !== "1") return false;
  const supplied = firstHeader(request.headers["x-gateway-internal-token"]);
  if (!supplied) return false;
  const expected = Buffer.from(internalGatewayToken);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
