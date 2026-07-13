import { computed, getCurrentScope, onScopeDispose, ref, watch, type DeepReadonly, type Ref } from "vue";
import {
  DEFAULT_DEDUP_INTERVAL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TTL,
  deleteCache,
  getCache,
  setCache
} from "./swrCache";
import type { SWROptions, SWRReturn } from "./swrTypes";

export type { SWROptions, SWRReturn } from "./swrTypes";
export { clearAllSWRCache, getSWRCacheStats } from "./swrCache";

function registerCleanup(cleanup: () => void): void {
  if (getCurrentScope()) onScopeDispose(cleanup);
}

export function useSWR<T>(
  key: string | (() => string | null | undefined),
  fetcher: () => Promise<T>,
  options: SWROptions<T> = {}
): SWRReturn<T> {
  const {
    ttl = DEFAULT_TTL,
    revalidateOnFocus = true,
    revalidateOnReconnect = true,
    dedupingInterval = DEFAULT_DEDUP_INTERVAL,
    onSuccess,
    onError,
    shouldRetryOnError = true,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const isLoading = ref(false);
  const isValidating = ref(false);

  const inflightPromises = new Map<string, Promise<T>>();
  let currentKey = typeof key === "function" ? "" : key;
  let lastRevalidateAt = -Infinity;
  let validationSequence = 0;

  function resolveKey(): string {
    return typeof key === "function" ? (key() ?? "") : key;
  }

  function syncCurrentKey(): void {
    const resolvedKey = resolveKey();
    if (resolvedKey === currentKey) return;
    currentKey = resolvedKey;
    data.value = null;
    error.value = null;
  }

  const isStale = computed(() => {
    if (!data.value || !currentKey) return true;
    const cached = getCache<T>(currentKey);
    return !cached || Date.now() - cached.timestamp > ttl;
  });

  async function executeWithRetry(requestKey: string, retries = 0): Promise<T> {
    try {
      const result = await fetcher();
      try { onSuccess?.(result); } catch { /* ignore callback */ }
      setCache(requestKey, result, ttl);
      if (currentKey === requestKey) {
        error.value = null;
        data.value = result;
      }
      return result;
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err));
      try { onError?.(normalized); } catch { /* ignore callback */ }
      if (shouldRetryOnError && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * Math.pow(2, retries + 1), 8000)));
        return executeWithRetry(requestKey, retries + 1);
      }
      if (currentKey === requestKey) error.value = normalized;
      throw normalized;
    }
  }

  async function revalidate(isBackground = false, revalidateOptions: { force?: boolean } = {}): Promise<boolean> {
    const { force = false } = revalidateOptions;
    syncCurrentKey();
    if (!currentKey) return false;
    const requestKey = currentKey;

    if (!force && !isBackground && Number.isFinite(lastRevalidateAt) && Date.now() - lastRevalidateAt < dedupingInterval) {
      return false;
    }

    const existing = inflightPromises.get(requestKey);
    if (existing) {
      try {
        const result = await existing;
        if (currentKey === requestKey) data.value = result;
        return true;
      } catch {
        return false;
      }
    }

    lastRevalidateAt = Date.now();
    const validationId = ++validationSequence;
    if (!isBackground) isValidating.value = true;
    const inflightPromise = executeWithRetry(requestKey);
    inflightPromises.set(requestKey, inflightPromise);
    try {
      await inflightPromise;
      return true;
    } catch {
      return false;
    } finally {
      if (inflightPromises.get(requestKey) === inflightPromise) inflightPromises.delete(requestKey);
      if (validationId === validationSequence && currentKey === requestKey) {
        isValidating.value = false;
        isLoading.value = false;
      }
    }
  }

  async function mutate(newData?: T | ((current: T | null) => T | null) | null): Promise<void> {
    if (newData === undefined) {
      await revalidate(false, { force: true });
      return;
    }
    if (newData === null) {
      data.value = null;
      error.value = null;
      deleteCache(currentKey);
      setTimeout(() => { void revalidate(true, { force: true }); }, 0);
      return;
    }
    const updated = typeof newData === "function"
      ? (newData as (current: T | null) => T | null)(data.value)
      : newData;
    data.value = updated;
    if (updated !== null) setCache(currentKey, updated, ttl);
    else deleteCache(currentKey);
  }

  function invalidate(): void {
    deleteCache(currentKey);
    data.value = null;
    error.value = null;
  }

  async function init(): Promise<void> {
    syncCurrentKey();
    if (!currentKey) return;
    const cached = getCache<T>(currentKey);
    if (cached) {
      data.value = cached.data;
      error.value = cached.error || null;
      return;
    }
    isLoading.value = true;
    await revalidate(true, { force: true });
  }

  if (typeof key === "function") {
    const stop = watch(key, async (newKey) => {
      const resolved = newKey ?? "";
      if (resolved === currentKey) return;
      currentKey = resolved;
      data.value = null;
      error.value = null;
      if (!resolved) return;
      isLoading.value = true;
      await revalidate(true, { force: true });
    }, { immediate: true });
    registerCleanup(stop);
  } else {
    void init();
  }

  if (revalidateOnFocus && typeof window !== "undefined" && typeof document !== "undefined") {
    const handleFocus = () => {
      if (document.visibilityState === "visible") void revalidate(true);
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    registerCleanup(() => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    });
  }

  if (revalidateOnReconnect && typeof window !== "undefined") {
    const handleOnline = () => { void revalidate(true); };
    window.addEventListener("online", handleOnline);
    registerCleanup(() => window.removeEventListener("online", handleOnline));
  }

  return {
    data: data as DeepReadonly<Ref<T | null>>,
    error: error as DeepReadonly<Ref<Error | null>>,
    isLoading: isLoading as DeepReadonly<Ref<boolean>>,
    isValidating: isValidating as DeepReadonly<Ref<boolean>>,
    isStale: isStale.value,
    mutate,
    revalidate: () => revalidate(false, { force: true }),
    invalidate,
  };
}
