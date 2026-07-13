import { shallowRef, ref } from "vue";
import type { ShallowRef } from "vue";
import { normalizeApiError } from "../services/http/error-handler";

export interface UseRequestOptions<TResult> {
  immediate?: boolean;
  initialData?: TResult | null;
  fallbackMessage?: string;
}

export function useRequest<TResult, TArgs extends unknown[] = []>(
  handler: (...args: TArgs) => Promise<TResult>,
  options: UseRequestOptions<TResult> = {}
) {
  const data = shallowRef<TResult | null>(options.initialData ?? null) as ShallowRef<TResult | null>;
  const loading = ref(false);
  const error = ref("");

  async function execute(...args: TArgs) {
    loading.value = true;
    error.value = "";
    try {
      const result = await handler(...args);
      data.value = result;
      return result;
    } catch (caught) {
      error.value = normalizeApiError(caught, options.fallbackMessage).message;
      return null;
    } finally {
      loading.value = false;
    }
  }

  if (options.immediate) {
    void execute(...([] as unknown as TArgs));
  }

  return { data, loading, error, execute };
}
