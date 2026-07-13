import { queryPayload, urlView } from "./actionPayload";
import { resolveAdminGatewayAction } from "./actionResolversAdmin";
import { resolveCoreGatewayAction } from "./actionResolversCore";
import type { GatewayAction } from "./types";

export function resolveGatewayAction(url: string, method: string, body: unknown): GatewayAction {
  const parsed = urlView(url);
  const path = parsed.pathname;
  const query = queryPayload(parsed);
  const action = resolveCoreGatewayAction(path, method, query, body)
    ?? resolveAdminGatewayAction(path, method, query, body);
  if (action) return action;
  throw new Error(`Gateway action is not mapped for ${method} ${path}`);
}
