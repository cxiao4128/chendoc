import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSWR, clearAllSWRCache, getSWRCacheStats } from "./useSWR";

describe("useSWR 缓存功能", () => {
  beforeEach(() => {
    clearAllSWRCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应缓存数据", async () => {
    const mockData = { id: 1 };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    useSWR("test:cache", fetcher);
    await vi.runAllTimersAsync();
    const swr2 = useSWR("test:cache", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(swr2.data.value).toEqual(mockData);
  });

  it("应区分不同 key 的缓存", async () => {
    const fetcher1 = vi.fn().mockResolvedValue({ id: 1 });
    const fetcher2 = vi.fn().mockResolvedValue({ id: 2 });

    const swr1 = useSWR("test:key1", fetcher1);
    await vi.runAllTimersAsync();
    const swr2 = useSWR("test:key2", fetcher2);
    await vi.runAllTimersAsync();

    expect(fetcher1).toHaveBeenCalledTimes(1);
    expect(fetcher2).toHaveBeenCalledTimes(1);
    expect(swr1.data.value).toEqual({ id: 1 });
    expect(swr2.data.value).toEqual({ id: 2 });
  });

  it("应在 TTL 过期后重新获取", async () => {
    const mockData = { id: 1 };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    useSWR("test:ttl", fetcher, { ttl: 1000 });
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(1500);
    const swr2 = useSWR("test:ttl", fetcher, { ttl: 1000 });
    await vi.runAllTimersAsync();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(swr2.data.value).toEqual(mockData);
  });

  it("应支持手动更新和函数式更新缓存", async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 1 });
    const swr = useSWR("test:mutate", fetcher);

    await vi.runAllTimersAsync();
    await swr.mutate({ count: 2 });
    await swr.mutate((current: { count: number } | null) => ({ count: (current?.count ?? 0) + 1 }));

    expect(swr.data.value).toEqual({ count: 3 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("应支持清除缓存和全局统计", async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const swr = useSWR("test:clear", fetcher);

    await vi.runAllTimersAsync();
    expect(swr.data.value).toEqual({ id: 1 });
    expect(getSWRCacheStats().size).toBe(1);

    await swr.mutate(null);
    expect(swr.data.value).toBeNull();
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(2);

    clearAllSWRCache();
    expect(getSWRCacheStats().keys).toHaveLength(0);
  });
});
