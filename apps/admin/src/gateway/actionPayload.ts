import { isGatewayActionCode } from "../../../../server/src/gateway/action-registry";
import type { GatewayAction } from "./types";

export function parseBody(body: BodyInit | null | undefined) {
  if (!body) return {};
  if (typeof body !== "string") throw new Error("Gateway packet layer only supports JSON API bodies.");
  return JSON.parse(body) as unknown;
}

export function urlView(url: string) {
  return new URL(url, window.location.origin);
}

export function queryPayload(url: URL) {
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

export function actionPayload(
  action: string,
  input: {
    body?: unknown;
    params?: Record<string, string | number>;
    query?: Record<string, string>;
    target?: string;
    mode?: string;
    scope?: string;
  } = {}
): GatewayAction {
  if (!isGatewayActionCode(action)) throw new Error(`Unknown gateway action code: ${action}`);
  return {
    action,
    payload: {
      ...(input.params ? { params: input.params } : {}),
      ...(input.query && Object.keys(input.query).length ? { query: input.query } : {}),
      ...(input.target ? { target: input.target } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      body: input.body ?? {}
    }
  };
}
