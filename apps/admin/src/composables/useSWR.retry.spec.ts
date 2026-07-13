import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSWR, clearAllSWRCache } from "./useSWR";

describe("useSWR 错误重试和去重", () => {
  beforeEach(() => {
    clearAllSWRCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应支持自动重试", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Error 1"))
      .mockRejectedValueOnce(new Error("Error 2"))
      .mockResolvedValueOnce({ id: 1 });

    const swr = useSWR("test:retry", fetcher, { shouldRetryOnError: true, maxRetries: 3 });

    await vi.runAllTimersAsync();

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(swr.data.value).toEqual({ id: 1 });
    expect(swr.error.value).toBeNull();
  });

  it("应限制最大重试次数并支持禁用重试", async () => {
    const retryFetcher = vi.fn().mockRejectedValue(new Error("Persistent error"));
    const noRetryFetcher = vi.fn().mockRejectedValue(new Error("No retry"));

    const swr = useSWR("test:maxRetry", retryFetcher, { shouldRetryOnError: true, maxRetries: 2 });
    await vi.runAllTimersAsync();
    const noRetry = useSWR("test:noRetry", noRetryFetcher, { shouldRetryOnError: false });
    await vi.runAllTimersAsync();

    expect(retryFetcher).toHaveBeenCalledTimes(3);
    expect(noRetryFetcher).toHaveBeenCalledTimes(1);
    expect(swr.error.value).toBeInstanceOf(Error);
    expect(noRetry.error.value).toBeInstanceOf(Error);
  });

  it("应在短时间内忽略重复请求", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const swr = useSWR("test:dedup", fetcher, { dedupingInterval: 5000 });

    swr.revalidate();
    swr.revalidate();
    swr.revalidate();
    await vi.runAllTimersAsync();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
