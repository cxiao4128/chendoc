import type { DeepReadonly, Ref } from "vue";

export interface SWROptions<T> {
  ttl?: number;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  dedupingInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  shouldRetryOnError?: boolean;
  maxRetries?: number;
}

export interface SWRReturn<T> {
  data: DeepReadonly<Ref<T | null>>;
  error: DeepReadonly<Ref<Error | null>>;
  isLoading: DeepReadonly<Ref<boolean>>;
  isValidating: DeepReadonly<Ref<boolean>>;
  isStale: boolean;
  mutate: (data?: T | ((current: T | null) => T | null) | null) => Promise<void>;
  revalidate: () => Promise<boolean>;
  invalidate: () => void;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  error?: Error;
}
