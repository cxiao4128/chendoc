import type { FastifyInstance, FastifyRequest } from "fastify";
import { BadRequestError } from "../utils/errors.js";
import { clientIpFromRequest } from "../utils/requestIp.js";
import { isGatewayActionCode, type GatewayActionCode } from "./action-registry.js";
import { internalGatewayHeaders } from "./internal-request.js";

// Gateway 调试模式
const GATEWAY_DEBUG = process.env.NODE_ENV !== "production";

type GatewayMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface GatewayTarget {
  method: GatewayMethod;
  url: string;
  body?: unknown;
}

type GatewayPayload = Record<string, unknown>;

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function payloadOf(request: FastifyRequest): GatewayPayload {
  return asRecord(request.body);
}

function paramsOf(payload: GatewayPayload) {
  return asRecord(payload.params);
}

function queryOf(payload: GatewayPayload) {
  return asRecord(payload.query);
}

function bodyOf(payload: GatewayPayload) {
  return payload.body ?? {};
}

function stringValue(value: unknown, name: string) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new BadRequestError(`Missing gateway action parameter: ${name}`, "GATEWAY_PARAM_MISSING");
}

function param(payload: GatewayPayload, name: string) {
  return encodeURIComponent(stringValue(paramsOf(payload)[name], name));
}

function target(payload: GatewayPayload) {
  return typeof payload.target === "string" ? payload.target : "";
}

function queryString(payload: GatewayPayload) {
  const query = queryOf(payload);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      continue;
    }
    params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function actionTarget(actionCode: GatewayActionCode, payload: GatewayPayload): GatewayTarget {
  switch (actionCode) {
    case "a1":
      return { method: "POST", url: "/api/auth/login", body: bodyOf(payload) };
    case "a2":
      return { method: "POST", url: "/api/auth/register", body: bodyOf(payload) };
    case "a3":
      return { method: "POST", url: "/api/auth/me", body: {} };
    case "a4":
      return { method: "POST", url: "/api/auth/change-password", body: bodyOf(payload) };
    case "a5":
      return { method: "POST", url: "/api/auth/refresh", body: {} };
    case "a6":
      return { method: "POST", url: "/api/auth/logout", body: {} };

    case "c1":
      return { method: "GET", url: "/api/captcha" };

    case "p1":
      return { method: "GET", url: "/api/public/settings/site" };
    case "p2":
      return {
        method: "POST",
        url: `/api/public/r/${param(payload, "shareKey")}/verify-password`,
        body: bodyOf(payload)
      };
    case "p3":
      return {
        method: "GET",
        url: `/api/public/r/${param(payload, "shareKey")}`
      };

    case "d1":
      return {
        method: "GET",
        url: `${payload.mode === "search" ? "/api/docs/search" : "/api/docs"}${queryString(payload)}`
      };
    case "d2":
      return { method: "GET", url: `/api/docs/${param(payload, "docUid")}` };
    case "d3":
      return paramsOf(payload).docUid
        ? { method: "PATCH", url: `/api/docs/${param(payload, "docUid")}`, body: bodyOf(payload) }
        : { method: "POST", url: "/api/docs", body: bodyOf(payload) };
    case "d4":
      return { method: "DELETE", url: `/api/docs/${param(payload, "docUid")}` };
    case "d5":
      return { method: "POST", url: "/api/docs/bulk-delete", body: bodyOf(payload) };
    case "d6":
      return { method: "POST", url: `/api/docs/${param(payload, "docUid")}/publish`, body: {} };
    case "d7":
      return { method: "GET", url: `/api/docs/${param(payload, "docUid")}/versions` };
    case "d8":
      return {
        method: "POST",
        url: `/api/docs/${param(payload, "docUid")}/versions/${param(payload, "versionId")}/restore`,
        body: {}
      };

    case "r1":
      return {
        method: "GET",
        url: `${payload.scope === "admin" ? "/api/admin/docs/trash" : "/api/docs/trash"}${queryString(payload)}`
      };
    case "r2":
      return {
        method: "POST",
        url: payload.scope === "admin" ? "/api/admin/docs/trash/bulk-restore" : "/api/docs/trash/batch-restore",
        body: bodyOf(payload)
      };
    case "r3":
      return {
        method: "POST",
        url: payload.scope === "admin" ? "/api/admin/docs/trash/bulk-hard-delete" : "/api/docs/trash/batch-delete",
        body: bodyOf(payload)
      };
    case "r4":
      return { method: "GET", url: "/api/docs/trash/stats" };

    case "h1":
      return { method: "POST", url: `/api/docs/${param(payload, "docUid")}/share`, body: bodyOf(payload) };
    case "h2":
      return { method: "GET", url: `/api/shares/doc/${param(payload, "docUid")}` };
    case "h3":
      return { method: "PATCH", url: `/api/shares/${param(payload, "id")}`, body: bodyOf(payload) };
    case "h4":
      return { method: "DELETE", url: `/api/shares/${param(payload, "id")}` };
    case "h5":
      return { method: "GET", url: "/api/admin/share-reviews" };
    case "h6":
      return { method: "POST", url: `/api/admin/share-reviews/${param(payload, "id")}/review`, body: bodyOf(payload) };

    case "s1":
      if (target(payload) === "publicSite") return { method: "GET", url: "/api/public/settings/site" };
      if (target(payload) === "site") return { method: "GET", url: "/api/settings/site" };
      if (target(payload) === "r2") return { method: "GET", url: "/api/settings/storage/r2" };
      if (target(payload) === "logs") return { method: "GET", url: "/api/settings/operation-logs" };
      if (target(payload) === "systemStatus") return { method: "GET", url: "/api/settings/system/status" };
      if (target(payload) === "systemExport") return { method: "GET", url: "/api/settings/system/export" };
      if (target(payload) === "settings") return { method: "GET", url: "/api/settings" };
      break;
    case "s2":
      if (target(payload) === "site") return { method: "POST", url: "/api/settings/site", body: bodyOf(payload) };
      if (target(payload) === "r2") return { method: "POST", url: "/api/settings/storage/r2", body: bodyOf(payload) };
      if (target(payload) === "r2Test") return { method: "POST", url: "/api/settings/storage/r2/test", body: bodyOf(payload) };
      if (target(payload) === "systemAction") {
        return { method: "POST", url: `/api/settings/system/actions/${param(payload, "action")}`, body: {} };
      }
      if (target(payload) === "settings") return { method: "PATCH", url: "/api/settings", body: bodyOf(payload) };
      break;

    case "u1":
      return { method: "GET", url: "/api/admin/users" };
    case "u2":
      return { method: "GET", url: `/api/admin/users/${param(payload, "id")}` };
    case "u3":
      return { method: "POST", url: `/api/admin/users/${param(payload, "id")}/promote`, body: {} };
    case "u4":
      return { method: "POST", url: `/api/admin/users/${param(payload, "id")}/disable`, body: {} };
    case "u5":
      return { method: "POST", url: `/api/admin/users/${param(payload, "id")}/enable`, body: {} };
    case "u6":
      return { method: "DELETE", url: `/api/admin/users/${param(payload, "id")}` };
    case "u7":
      return { method: "GET", url: `/api/admin/users/${param(payload, "id")}/password` };
    case "u8":
      return { method: "POST", url: `/api/admin/users/${param(payload, "id")}/password`, body: bodyOf(payload) };

    case "f1":
      return { method: "GET", url: "/api/uploads/policy" };
    case "f2":
      return { method: "POST", url: "/api/uploads/presign", body: bodyOf(payload) };
    case "f3":
      return { method: "POST", url: "/api/uploads/complete", body: bodyOf(payload) };
    case "f4":
      return { method: "DELETE", url: `/api/uploads/${param(payload, "id")}` };

    case "w1":
      return { method: "GET", url: "/api/spaces" };
    case "w2":
      return { method: "POST", url: "/api/spaces", body: bodyOf(payload) };
    case "w3":
      return { method: "PATCH", url: `/api/spaces/${param(payload, "id")}`, body: bodyOf(payload) };
    case "w4":
      return { method: "DELETE", url: `/api/spaces/${param(payload, "id")}` };

    case "fm1":
      return { method: "GET", url: "/api/forms" };
    case "fm2":
      return { method: "POST", url: "/api/forms", body: bodyOf(payload) };
    case "fm3":
      return { method: "GET", url: `/api/forms/${param(payload, "id")}` };
    case "fm4":
      return { method: "PUT", url: `/api/forms/${param(payload, "id")}`, body: bodyOf(payload) };
    case "fm5":
      return { method: "DELETE", url: `/api/forms/${param(payload, "id")}` };
    case "fm6":
      return { method: "POST", url: `/api/forms/${param(payload, "id")}/publish`, body: bodyOf(payload) };
    case "fm7":
      return { method: "GET", url: `/api/forms/${param(payload, "id")}/submissions${queryString(payload)}` };
    case "fm8":
      return { method: "GET", url: `/api/forms/${param(payload, "id")}/export${queryString(payload)}` };
    case "fm9":
      return { method: "GET", url: `/api/forms/${param(payload, "id")}/ip-stats` };
    case "fm10":
      return { method: "DELETE", url: `/api/forms/${param(payload, "id")}/submissions` };
    case "fm11":
      return { method: "DELETE", url: `/api/forms/${param(payload, "id")}/submissions/${param(payload, "submissionId")}` };

    case "i1":
      return { method: "GET", url: "/api/admin/invites" };
    case "i2":
      return { method: "POST", url: "/api/admin/invites", body: bodyOf(payload) };
    case "i3":
      return { method: "POST", url: "/api/admin/invites/batch", body: bodyOf(payload) };
    case "i4":
      return { method: "PATCH", url: `/api/admin/invites/${param(payload, "id")}/disable`, body: {} };
    case "i5":
      return { method: "DELETE", url: `/api/admin/invites/${param(payload, "id")}` };

    case "x1":
      return { method: "GET", url: `/api/admin/docs/by-uid/${param(payload, "docUid")}` };
    case "x2":
      return { method: "DELETE", url: `/api/admin/docs/by-uid/${param(payload, "docUid")}` };

    case "y1":
      return { method: "GET", url: "/api/admin/security/totp/status" };
    case "y2":
      return { method: "POST", url: "/api/admin/security/totp/setup", body: {} };
    case "y3":
      return { method: "POST", url: "/api/admin/security/totp/enable", body: bodyOf(payload) };
    case "y4":
      return { method: "POST", url: "/api/admin/security/totp/disable", body: bodyOf(payload) };
    case "y6":
      return { method: "POST", url: "/api/admin/security/totp/recovery-codes", body: bodyOf(payload) };
    case "y7":
      return { method: "POST", url: "/api/admin/security/totp/reset", body: bodyOf(payload) };
    case "y8":
      return { method: "POST", url: "/api/security/danger-verify", body: bodyOf(payload) };
  }

  throw new BadRequestError("Unknown gateway action.", "INVALID_GATEWAY_ACTION");
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function internalHeaders(request: FastifyRequest) {
  const clientIp = clientIpFromRequest(request);
  const headers: Record<string, string> = {
    ...internalGatewayHeaders(),
    "x-forwarded-for": clientIp || request.ip,
    "x-real-ip": clientIp || request.ip
  };

  for (const name of ["authorization", "user-agent", "x-client-risk", "forwarded", "cf-connecting-ip"]) {
    const value = headerValue(request, name);
    if (value) headers[name] = value;
  }

  return headers;
}

function parseInjectedPayload(payload: string, contentType: string | undefined) {
  if (!payload) return null;
  if (!contentType?.includes("application/json")) return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

export async function gatewayRoutes(app: FastifyInstance) {
  app.post("/api/gateway", async (request, reply) => {
    try {
      const actionCode = request.packet?.actionCode ?? payloadOf(request).actionCode as string | undefined;
      if (!actionCode) {
        return reply.code(400).send({ code: "INVALID_ACTION", message: "Invalid gateway action." });
      }
      if (!isGatewayActionCode(actionCode)) {
        return reply.code(400).send({ code: "INVALID_ACTION", message: "Invalid gateway action." });
      }

      if (GATEWAY_DEBUG) {
        console.log(`[gateway] ${request.method} ${request.url} → action: ${actionCode}`);
      }

      const targetRequest = actionTarget(actionCode, payloadOf(request));
      const hasBody = targetRequest.method !== "GET" && targetRequest.method !== "DELETE";

      const response = await app.inject({
        method: targetRequest.method,
        url: targetRequest.url,
        headers: {
          ...internalHeaders(request),
          ...(hasBody ? { "content-type": "application/json" } : {})
        },
        payload: hasBody ? JSON.stringify(targetRequest.body ?? {}) : undefined
      });

      if (GATEWAY_DEBUG && response.statusCode >= 400) {
        console.log(`[gateway] ${targetRequest.method} ${targetRequest.url} ← ${response.statusCode}`);
      }

      const contentType = Array.isArray(response.headers["content-type"])
        ? response.headers["content-type"][0]
        : response.headers["content-type"];
      const setCookie = response.headers["set-cookie"];
      if (setCookie) reply.header("Set-Cookie", setCookie);
      return reply
        .code(response.statusCode)
        .send(parseInjectedPayload(response.body, contentType));
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Gateway processing failed");
      if (GATEWAY_DEBUG) {
        console.error("[gateway] error:", error.message);
      }
      return reply.code(500).send({ code: "GATEWAY_ERROR", message: "Gateway request failed." });
    }
  });
}
