export interface ApiEndpoints {
  login: string;
  register: string;
  me: string;
  publicKey: string;
  challenge: string;
}

const defaults: ApiEndpoints = {
  login: "/api/auth/login",
  register: "/api/auth/register",
  me: "/api/auth/me",
  publicKey: "/api/crypto/public-key",
  challenge: "/api/crypto/challenge"
};

export const endpoints: ApiEndpoints = { ...defaults };

let bootstrapLoaded = false;

function isLocalApiPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/api/");
}

function applyEndpointOverrides(input: unknown) {
  if (!input || typeof input !== "object") return;
  const source = "endpoints" in input && typeof input.endpoints === "object"
    ? input.endpoints as Partial<Record<keyof ApiEndpoints, unknown>>
    : input as Partial<Record<keyof ApiEndpoints, unknown>>;

  (Object.keys(defaults) as Array<keyof ApiEndpoints>).forEach((key) => {
    if (isLocalApiPath(source[key])) endpoints[key] = source[key];
  });
}

export async function loadEndpointOverrides() {
  if (bootstrapLoaded) return endpoints;
  bootstrapLoaded = true;

  try {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) return endpoints;
    applyEndpointOverrides(await response.json());
  } catch {
    // The current backend does not need to provide bootstrap metadata.
  }

  return endpoints;
}

export function resolveApiPath(url: string) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

export function isCredentialEndpoint(url: string) {
  const path = resolveApiPath(url);
  return path === endpoints.login || path === endpoints.register;
}
