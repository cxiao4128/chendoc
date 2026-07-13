import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { useSWR, clearAllSWRCache } from "./useSWR";

describe("useSWR 基本功能", () => {
  beforeEach(() => {
    clearAllSWRCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("应返回初始状态", () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const { data, error, isLoading, isValidating } = useSWR("test:basic", fetcher);

    expect(data.value).toBeNull();
    expect(error.value).toBeNull();
    expect(isLoading.value).toBe(true);
    expect(isValidating.value).toBe(false);
  });

  it("应获取数据并更新状态", async () => {
    const mockData = { id: 1, name: "test" };
    const fetcher = vi.fn().mockResolvedValue(mockData);
    const swr = useSWR("test:fetch", fetcher);

    await vi.runAllTimersAsync();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(swr.data.value).toEqual(mockData);
    expect(swr.isLoading.value).toBe(false);
    expect(swr.error.value).toBeNull();
  });

  it("应在获取失败时设置错误", async () => {
    const error = new Error("Network error");
    const fetcher = vi.fn().mockRejectedValue(error);
    const swr = useSWR("test:error", fetcher);

    await vi.runAllTimersAsync();

    expect(swr.error.value).toEqual(error);
    expect(swr.data.value).toBeNull();
  });

  it("动态 key 切换时不把旧响应写入新 key", async () => {
    const key = ref("old");
    let resolveOld!: (value: { id: string }) => void;
    let resolveNew!: (value: { id: string }) => void;
    const oldResponse = new Promise<{ id: string }>((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise<{ id: string }>((resolve) => { resolveNew = resolve; });
    const fetcher = vi.fn(() => key.value === "old" ? oldResponse : newResponse);
    const swr = useSWR(() => key.value, fetcher);

    key.value = "new";
    await nextTick();
    resolveNew({ id: "new" });
    await Promise.resolve();
    resolveOld({ id: "old" });
    await Promise.resolve();
    await Promise.resolve();

    expect(swr.data.value).toEqual({ id: "new" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
