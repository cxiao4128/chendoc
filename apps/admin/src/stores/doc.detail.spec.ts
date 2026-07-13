import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useDocStore } from "./doc";

vi.mock("../services/api/document.api", async () => ({
  listDocsApi: vi.fn(),
  getDocApi: vi.fn(),
  createDocApi: vi.fn(),
  updateDocApi: vi.fn(),
  searchDocsApi: vi.fn(),
  bulkDeleteDocsApi: vi.fn(),
}));

import { getDocApi } from "../services/api/document.api";

describe("useDocStore 详情缓存", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });

  it("应加载并缓存文档详情", async () => {
    const mockDoc = { docUid: "doc1", title: "Doc 1", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "", revision: 1 };
    (getDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: mockDoc });

    const store = useDocStore();
    const result = await store.loadDoc("doc1");
    await store.loadDoc("doc1");

    expect(getDocApi).toHaveBeenCalledWith("doc1", expect.any(Object));
    expect(getDocApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockDoc);
    expect(store.current).toEqual(mockDoc);
  });

  it("应更新缓存命中率统计", async () => {
    const mockDoc = { docUid: "doc1", title: "Doc 1", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "", revision: 1 };
    (getDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: mockDoc });

    const store = useDocStore();
    await store.loadDoc("doc1");
    await store.loadDoc("doc1");
    await store.loadDoc("doc1");
    await store.loadDoc("doc1");

    expect(store.cacheStats.detailMisses).toBe(1);
    expect(store.cacheStats.detailHits).toBe(3);
    expect(store.detailHitRate).toBeCloseTo(0.75, 2);
  });

  it("invalidateDocCache 应清除指定文档缓存", async () => {
    const mockDoc = { docUid: "doc1", title: "Doc 1", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "", revision: 1 };
    (getDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: mockDoc });

    const store = useDocStore();
    await store.loadDoc("doc1");
    store.invalidateDocCache("doc1");

    expect(store.cacheStats.detailHits).toBe(0);
    expect(store.cacheStats.detailMisses).toBe(1);
  });

  it("force 选项应绕过详情缓存", async () => {
    const oldDoc = { docUid: "doc1", title: "Old", summary: "", status: "draft", pinned: false, wordCount: 1, createdAt: "", updatedAt: "", revision: 1 };
    const restoredDoc = { ...oldDoc, title: "Restored", revision: 2 };
    (getDocApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ doc: oldDoc })
      .mockResolvedValueOnce({ doc: restoredDoc });

    const store = useDocStore();
    await store.loadDoc("doc1");
    await store.loadDoc("doc1", { force: true });

    expect(getDocApi).toHaveBeenCalledTimes(2);
    expect(store.current?.title).toBe("Restored");
  });
});
