/**
 * useSWR.ts - Stale-While-Revalidate Hook
 *
 * 提供标准 SWR 语义的数据获取和缓存管理
 */
import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef, type DeepReadonly } from "vue";

export interface SWROptions<T> {
  /** 缓存 TTL（毫秒），默认 2 分钟 */
  ttl?: number;
  /** 焦点重验证，默认 true */
  revalidateOnFocus?: boolean;
  /** 网络恢复重验证，默认 true */
  revalidateOnReconnect?: boolean;
  /** 去重间隔（毫秒），默认 2 秒 */
  dedupingInterval?: number;
  /** 成功回调 */
  onSuccess?: (data: T) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 错误重试，默认 true */
  shouldRetryOnError?: boolean;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}

export interface SWRReturn<T> {
  /** 数据 */
  data: DeepReadonly<Ref<T | null>>;
  /** 错误 */
  error: DeepReadonly<Ref<Error | null>>;
  /** 是否首次加载中 */
  isLoading: DeepReadonly<Ref<boolean>>;
  /** 是否正在验证/重载 */
  isValidating: DeepReadonly<Ref<boolean>>;
  /** 缓存数据是否过期 */
  isStale: boolean;
  /** 手动更新缓存 */
  mutate: (data?: T | ((current: T | null) => T | null) | null) => Promise<void>;
  /** 手动重新验证 */
  revalidate: () => Promise<boolean>;
  /** 清除缓存 */
  invalidate: () => void;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  error?: Error;
}

// 全局缓存
const globalCache = new Map<string, CacheEntry<unknown>>();
const cacheTimestamps = new Map<string, number>();

// 默认配置
const DEFAULT_TTL = 2 * 60 * 1000; // 2 分钟
const DEFAULT_DEDUP_INTERVAL = 2 * 1000; // 2 秒
const DEFAULT_MAX_RETRIES = 3;

// 缓存清理定时器
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分钟清理一次

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of cacheTimestamps.entries()) {
      const entry = globalCache.get(key) as CacheEntry<unknown> | undefined;
      if (!entry) {
        cacheTimestamps.delete(key);
        continue;
      }
      const ttl = cacheTimestamps.get(`_ttl_${key}`) || DEFAULT_TTL;
      if (now - entry.timestamp > ttl) {
        globalCache.delete(key);
        cacheTimestamps.delete(key);
        cacheTimestamps.delete(`_ttl_${key}`);
      }
    }
  }, CLEANUP_INTERVAL);
}

function getCache<T>(key: string): CacheEntry<T> | null {
  const entry = globalCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const ttl = cacheTimestamps.get(`_ttl_${key}`) || DEFAULT_TTL;
  if (Date.now() - entry.timestamp > ttl) {
    globalCache.delete(key);
    cacheTimestamps.delete(key);
    cacheTimestamps.delete(`_ttl_${key}`);
    return null;
  }
  return entry;
}

function setCache<T>(key: string, data: T, ttl: number, error?: Error) {
  globalCache.set(key, { data, timestamp: Date.now(), error });
  cacheTimestamps.set(key, Date.now());
  cacheTimestamps.set(`_ttl_${key}`, ttl);
  startCleanupTimer();
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

  // 状态
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const isLoading = ref(false);
  const isValidating = ref(false);

  // 内部状态
  let inflightPromise: Promise<T> | null = null;
  let currentKey = typeof key === "function" ? (key() ?? "") : key;
  let lastRevalidateAt = 0;

  // 计算缓存是否过期
  const isStale = computed(() => {
    if (!data.value) return true;
    const cached = getCache<T>(currentKey);
    if (!cached) return true;
    return Date.now() - cached.timestamp > ttl;
  });

  // 重新验证
  async function revalidate(isBackground = false): Promise<boolean> {
    // 去重检查
    if (!isBackground && Date.now() - lastRevalidateAt < dedupingInterval) {
      return false;
    }

    // 检查是否有正在进行的请求
    if (inflightPromise) {
      try {
        const result = await inflightPromise;
        data.value = result;
        return true;
      } catch {
        return false;
      }
    }

    lastRevalidateAt = Date.now();

    if (!isBackground) {
      isValidating.value = true;
    }

    let retries = 0;
    const execute = async (): Promise<T> => {
      try {
        const result = await fetcher();
        if (onSuccess) {
          try { onSuccess(result); } catch { /* ignore */ }
        }
        error.value = null;
        setCache(currentKey, result, ttl);
        data.value = result;
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (onError) {
          try { onError(e); } catch { /* ignore */ }
        }
        if (shouldRetryOnError && retries < maxRetries) {
          retries++;
          const delay = Math.min(1000 * Math.pow(2, retries), 8000);
          await new Promise(r => setTimeout(r, delay));
          return execute();
        }
        error.value = e;
        throw e;
      }
    };

    try {
      inflightPromise = execute();
      await inflightPromise;
      return true;
    } catch {
      return false;
    } finally {
      inflightPromise = null;
      isValidating.value = false;
      isLoading.value = false;
    }
  }

  // 手动更新缓存
  async function mutate(newData?: T | ((current: T | null) => T | null) | null): Promise<void> {
    if (newData === undefined) {
      // 重新获取
      await revalidate();
    } else if (newData === null) {
      // 清除缓存
      data.value = null;
      error.value = null;
      globalCache.delete(currentKey);
    } else if (typeof newData === "function") {
      // 函数式更新
      const updater = newData as (current: T | null) => T | null;
      const updated = updater(data.value);
      data.value = updated;
      if (updated !== null) {
        setCache(currentKey, updated, ttl);
      }
    } else {
      // 直接设置
      data.value = newData;
      setCache(currentKey, newData, ttl);
    }
  }

  // 清除缓存
  function invalidate(): void {
    globalCache.delete(currentKey);
    cacheTimestamps.delete(currentKey);
    cacheTimestamps.delete(`_ttl_${currentKey}`);
    data.value = null;
    error.value = null;
  }

  // 初始化
  async function init() {
    const resolvedKey = typeof key === "function" ? (key() ?? "") : key;
    if (resolvedKey !== currentKey) {
      currentKey = resolvedKey;
      data.value = null;
      error.value = null;
    }

    if (!currentKey) return;

    // 先检查缓存
    const cached = getCache<T>(currentKey);
    if (cached) {
      data.value = cached.data;
      error.value = cached.error || null;
      if (isStale.value) {
        // 缓存过期，后台重新验证
        void revalidate(true);
      }
    } else {
      // 无缓存，首次加载
      isLoading.value = true;
      await revalidate();
    }
  }

  // 监听 key 变化
  if (typeof key === "function") {
    watch(key, async (newKey: string | null | undefined) => {
      const resolved = newKey ?? "";
      if (resolved !== currentKey) {
        currentKey = resolved;
        data.value = null;
        error.value = null;
        isLoading.value = true;
        if (resolved) {
          await revalidate();
        }
      }
    }, { immediate: true });
  } else {
    void init();
  }

  // 焦点重验证
  if (revalidateOnFocus) {
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        void revalidate(true);
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    onUnmounted(() => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    });
  }

  // 网络恢复重验证
  if (revalidateOnReconnect) {
    const handleOnline = () => { void revalidate(true); };
    window.addEventListener("online", handleOnline);
    onUnmounted(() => window.removeEventListener("online", handleOnline));
  }

  return {
    data: data as DeepReadonly<Ref<T | null>>,
    error: error as DeepReadonly<Ref<Error | null>>,
    isLoading: isLoading as DeepReadonly<Ref<boolean>>,
    isValidating: isValidating as DeepReadonly<Ref<boolean>>,
    isStale: isStale.value,
    mutate,
    revalidate: () => revalidate(false),
    invalidate,
  };
}

// 清除所有缓存
export function clearAllSWRCache(): void {
  globalCache.clear();
  cacheTimestamps.clear();
}

// 获取缓存统计
export function getSWRCacheStats(): { size: number; keys: string[] } {
  return {
    size: globalCache.size,
    keys: Array.from(globalCache.keys()),
  };
}
