const counters = new Map<string, number>();

export function recordClientError(category: string, error?: unknown) {
  counters.set(category, (counters.get(category) ?? 0) + 1);
  if (import.meta.env.DEV) console.warn(`[client-error:${category}]`, error);
}

export function clientErrorCounters() {
  return Object.fromEntries(counters);
}
