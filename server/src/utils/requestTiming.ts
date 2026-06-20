import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

export type TimingPhase = "db" | "r2" | "gatewayUnpack";
type TimingContext = { requestId: string; phases: Record<TimingPhase, number> };

const storage = new AsyncLocalStorage<TimingContext>();

export function enterRequestTiming(requestId: string) {
  storage.enterWith({ requestId, phases: { db: 0, r2: 0, gatewayUnpack: 0 } });
}

export function recordRequestTiming(phase: TimingPhase, durationMs: number) {
  const context = storage.getStore();
  if (context) context.phases[phase] += durationMs;
}

export function currentRequestTiming() {
  const context = storage.getStore();
  if (!context) return undefined;
  return {
    requestId: context.requestId,
    dbMs: Math.round(context.phases.db * 100) / 100,
    r2Ms: Math.round(context.phases.r2 * 100) / 100,
    gatewayUnpackMs: Math.round(context.phases.gatewayUnpack * 100) / 100
  };
}

export async function measureRequestPhase<T>(phase: TimingPhase, operation: () => T | Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    recordRequestTiming(phase, performance.now() - startedAt);
  }
}
