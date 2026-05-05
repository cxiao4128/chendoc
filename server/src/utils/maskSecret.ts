export function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

export function omitEmptySecrets<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => !(key.includes("secret") && value === ""))
  ) as Partial<T>;
}
