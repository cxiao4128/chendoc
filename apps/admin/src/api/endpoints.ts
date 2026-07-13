import { backendFetch } from "../config/runtime";

const slots = {
  signIn: "l",
  signUp: "r",
  profile: "m",
  serverKey: "k",
  proof: "h"
} as const;

type EndpointSlot = typeof slots[keyof typeof slots];

const apiRoot = "/api/";
const join = (...parts: string[]) => parts.join("");

const defaults: Record<EndpointSlot, string> = {
  [slots.signIn]: join(apiRoot, "auth/", "log", "in"),
  [slots.signUp]: join(apiRoot, "auth/", "reg", "ister"),
  [slots.profile]: join(apiRoot, "auth/", "me"),
  [slots.serverKey]: join(apiRoot, "crypto/", "public", "-key"),
  [slots.proof]: join(apiRoot, "crypto/", "chal", "lenge")
};

const current: Record<EndpointSlot, string> = { ...defaults };

const overrideAliases: Array<[EndpointSlot, string[]]> = [
  [slots.signIn, [slots.signIn, "signIn", join("log", "in")]],
  [slots.signUp, [slots.signUp, "signUp", join("reg", "ister")]],
  [slots.profile, [slots.profile, "profile", "me"]],
  [slots.serverKey, [slots.serverKey, "serverKey", join("public", "Key")]],
  [slots.proof, [slots.proof, "proof", join("chal", "lenge")]]
];

export const apiPaths = {
  signIn: () => current[slots.signIn],
  signUp: () => current[slots.signUp],
  profile: () => current[slots.profile],
  serverKey: () => current[slots.serverKey],
  proof: () => current[slots.proof]
};

let bootstrapLoaded = false;

function isLocalApiPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/api/");
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" ? input as Record<string, unknown> : null;
}

function applyEndpointOverrides(input: unknown) {
  const envelope = asRecord(input);
  if (!envelope) return;
  const packed = asRecord(envelope[join("end", "points")]);
  const source = packed ?? envelope;

  overrideAliases.forEach(([slot, aliases]) => {
    const next = aliases.map((key) => source[key]).find(isLocalApiPath);
    if (next) current[slot] = next;
  });
}

export async function loadEndpointOverrides() {
  if (bootstrapLoaded) return apiPaths;
  bootstrapLoaded = true;

  try {
    const response = await backendFetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) return apiPaths;
    applyEndpointOverrides(await response.json());
  } catch {
    // The current backend does not need to provide bootstrap metadata.
  }

  return apiPaths;
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
  return path === apiPaths.signIn() || path === apiPaths.signUp();
}
