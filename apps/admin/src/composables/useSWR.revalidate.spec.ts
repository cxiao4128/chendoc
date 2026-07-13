import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { useSWR, clearAllSWRCache } from "./useSWR";

describe("useSWR 重新验证和动态 key", () => {
  beforeEach(() => {
    clearAllSWRCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应支持手动重新验证和 invalidate", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const swr = useSWR("test:revalidate", fetcher);

    await vi.runAllTimersAsync();
    await swr.revalidate();
    swr.invalidate();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(swr.data.value).toBeNull();
  });

  it("应调用回调", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    useSWR("test:onSuccess", vi.fn().mockResolvedValue({ id: 1 }), { onSuccess });
    await vi.runAllTimersAsync();
    useSWR("test:onError", vi.fn().mockRejectedValue(new Error("Test error")), { onError });
    await vi.runAllTimersAsync();

    expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("应支持函数式 key 和空 key", async () => {
    const keyValue = ref("key1");
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });

    useSWR(() => keyValue.value, fetcher);
    await vi.runAllTimersAsync();
    keyValue.value = "key2";
    await nextTick();
    await vi.runAllTimersAsync();
    useSWR(() => null as string | null, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
