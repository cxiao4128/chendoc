export const gatewayActionCodes = [
  "a1", "a2", "a3", "a4", "a5", "a6", "c1", "p1", "p2", "p3",
  "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "r1", "r2", "r3", "r4",
  "h1", "h2", "h3", "h4", "h5", "h6", "s1", "s2",
  "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
  "f1", "f2", "f3", "f4", "w1", "w2", "w3", "w4",
  "fm1", "fm2", "fm3", "fm4", "fm5", "fm6", "fm7", "fm8", "fm9", "fm10", "fm11",
  "i1", "i2", "i3", "i4", "i5", "x1", "x2", "y1", "y2", "y3", "y4", "y6", "y7", "y8",
  "d9", "d10", "d11", "d12", "d13"
] as const;

export type GatewayActionCode = typeof gatewayActionCodes[number];
const actionCodeSet = new Set<string>(gatewayActionCodes);

export function isGatewayActionCode(value: string): value is GatewayActionCode {
  return actionCodeSet.has(value);
}

export const gatewayExemptApiPaths = [
  "/api/gateway", "/api/crypto/public-key", "/api/crypto/challenge", "/api/bootstrap", "/api/health", "/api/auth/restore"
] as const;

export function isGatewayExemptPath(path: string) {
  return (gatewayExemptApiPaths as readonly string[]).includes(path)
    || path.startsWith("/api/public/r/");
}
