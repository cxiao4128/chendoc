import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { gatewayActionCodes, gatewayExemptApiPaths, isGatewayExemptPath } from "./action-registry.js";

const projectRoot = resolve(import.meta.dirname, "../../..");

function uniqueMatches(source: string, pattern: RegExp) {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe("gateway action registry", () => {
  test("action codes are unique and valid", () => {
    const uniqueCodes = [...new Set(gatewayActionCodes)];
    expect(uniqueCodes.length).toBe(gatewayActionCodes.length);
    // 所有 action code 都应该是有效的标识符格式
    for (const code of gatewayActionCodes) {
      expect(/^[a-z][a-z0-9]*[0-9]+$/.test(code)).toBe(true);
    }
  });

  test("client and server reference valid action codes from registry", () => {
    const clientCore = readFileSync(resolve(projectRoot, "apps/admin/src/gateway/actionResolversCore.ts"), "utf8");
    const clientAdmin = readFileSync(resolve(projectRoot, "apps/admin/src/gateway/actionResolversAdmin.ts"), "utf8");
    const client = clientCore + clientAdmin;
    const server = readFileSync(resolve(projectRoot, "server/src/gateway/routes.ts"), "utf8");

    const clientActions = uniqueMatches(client, /actionPayload\("([a-z0-9]+)"/g);
    const serverActions = uniqueMatches(server, /case "([a-z0-9]+)"/g);

    // 所有客户端使用的 action code 必须在注册表中
    for (const action of clientActions) {
      expect(gatewayActionCodes).toContain(action);
    }

    // 所有服务端处理的 action code 必须在注册表中
    for (const action of serverActions) {
      expect(gatewayActionCodes).toContain(action);
    }

    for (const action of gatewayActionCodes) {
      expect(clientActions).toContain(action);
      expect(serverActions).toContain(action);
    }
  });

  test("forms are not gateway-exempt", () => {
    expect(gatewayExemptApiPaths.some((path) => path.startsWith("/api/forms"))).toBe(false);
  });

  test("public share reads and password verification remain directly reachable", () => {
    expect(isGatewayExemptPath("/api/public/r/112")).toBe(true);
    expect(isGatewayExemptPath("/api/public/r/112/verify-password")).toBe(true);
    expect(isGatewayExemptPath("/api/docs/112")).toBe(false);
  });

  test("public form views and submissions remain directly reachable", () => {
    expect(isGatewayExemptPath("/api/public/forms/form-112")).toBe(true);
    expect(isGatewayExemptPath("/api/public/forms/form-112/submissions")).toBe(true);
    expect(isGatewayExemptPath("/api/forms/112")).toBe(false);
  });
});
