import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { gatewayActionCodes, gatewayExemptApiPaths } from "./action-registry.js";

const projectRoot = resolve(import.meta.dirname, "../../..");

function uniqueMatches(source: string, pattern: RegExp) {
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe("gateway action registry", () => {
  test("client mappings and server dispatch use exactly registered actions", () => {
    const client = readFileSync(resolve(projectRoot, "apps/admin/src/gateway/client.ts"), "utf8");
    const server = readFileSync(resolve(projectRoot, "server/src/gateway/routes.ts"), "utf8");
    expect(uniqueMatches(client, /actionPayload\("([a-z0-9]+)"/g)).toEqual([...gatewayActionCodes].sort());
    expect(uniqueMatches(server, /case "([a-z0-9]+)"/g)).toEqual([...gatewayActionCodes].sort());
  });

  test("forms are not gateway-exempt", () => {
    expect(gatewayExemptApiPaths.some((path) => path.startsWith("/api/forms"))).toBe(false);
  });
});
