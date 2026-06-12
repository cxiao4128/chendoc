const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|token|authorization|captcha|otp|totp|secret|recovery|secretkey|accesskey|privatekey|aeskey|rsakey|body|content|database_url|r2_secret_access_key)/i;

export function redactSensitive<T>(input: T, depth = 0): T {
  if (input === null || input === undefined) return input;
  if (depth > 8) return "[redacted]" as T;
  if (typeof input === "string") {
    if (/^Bearer\s+/i.test(input)) return "Bearer ********" as T;
    return input as T;
  }
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((item) => redactSensitive(item, depth + 1)) as T;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_RE.test(key) ? "********" : redactSensitive(value, depth + 1);
  }
  return output as T;
}

export function redactHeaderValue(name: string, value: unknown) {
  return SENSITIVE_KEY_RE.test(name) ? "********" : value;
}
