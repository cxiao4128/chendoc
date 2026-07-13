import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useDocStore } from "./doc";
import type { DocDetail } from "../services/api";

vi.mock("../services/api/document.api", async () => ({
  listDocsApi: vi.fn(),
  getDocApi: vi.fn(),
  createDocApi: vi.fn(),
  updateDocApi: vi.fn(),
  searchDocsApi: vi.fn(),
  bulkDeleteDocsApi: vi.fn(),
}));

import { listDocsApi, getDocApi, updateDocApi, bulkDeleteDocsApi } from "../services/api/document.api";

describe("useDocStore 保存与删除", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });

  it("应保存文档并更新缓存", async () => {
    const mockDoc = { docUid: "doc1", title: "Updated", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "", revision: 2 };
    (getDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      doc: { ...mockDoc, title: "Original", revision: 1 },
    });
    (updateDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: mockDoc });

    const store = useDocStore();
    await store.loadDoc("doc1");
    const result = await store.saveDoc("doc1", { title: "Updated" });

    expect(updateDocApi).toHaveBeenCalledWith("doc1", expect.objectContaining({ title: "Updated" }));
    expect(result).toEqual(mockDoc);
    expect(store.current?.title).toBe("Updated");
  });

  it("旧文档保存响应不覆盖已切换的当前文档", async () => {
    let resolveSave!: (value: { doc: Record<string, unknown> }) => void;
    const savePromise = new Promise<{ doc: Record<string, unknown> }>((resolve) => {
      resolveSave = resolve;
    });
    const doc1 = { docUid: "doc1", title: "Doc 1", summary: "", status: "draft", pinned: false, wordCount: 1, createdAt: "", updatedAt: "", revision: 1 };
    const doc2 = { docUid: "doc2", title: "Doc 2", summary: "", status: "draft", pinned: false, wordCount: 1, createdAt: "", updatedAt: "", revision: 1 };
    (getDocApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ doc: doc1 })
      .mockResolvedValueOnce({ doc: doc2 });
    (updateDocApi as ReturnType<typeof vi.fn>).mockReturnValue(savePromise);

    const store = useDocStore();
    await store.loadDoc("doc1");
    const saving = store.saveDoc("doc1", { title: "Doc 1 updated" });
    await store.loadDoc("doc2");
    resolveSave({ doc: { ...doc1, title: "Doc 1 updated", revision: 2 } });
    await saving;

    expect(store.current?.docUid).toBe("doc2");
  });

  it("应检测版本冲突", async () => {
    (getDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      doc: { docUid: "doc1", title: "Original", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "", revision: 1 },
    });

    const store = useDocStore();
    await store.loadDoc("doc1");

    await expect(store.saveDoc("doc1", { title: "Updated", expectedRevision: 0 } as Partial<DocDetail>)).rejects.toThrow();
    expect(store.detailError).toContain("版本冲突");
  });

  it("应批量删除文档并更新状态", async () => {
    const mockDocs = [
      { docUid: "doc1", title: "Doc 1", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "" },
      { docUid: "doc2", title: "Doc 2", summary: "", status: "published", pinned: false, wordCount: 200, createdAt: "", updatedAt: "" },
    ];
    (listDocsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: mockDocs, pagination: { page: 1, hasMore: false } });
    (bulkDeleteDocsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ deletedDocUids: ["doc1"] });

    const store = useDocStore();
    await store.loadList();
    const result = await store.bulkDeleteDocs(["doc1"]);

    expect(result).toEqual(["doc1"]);
    expect(store.docs).toHaveLength(1);
    expect(store.docs[0].docUid).toBe("doc2");
  });

  it("应过滤无效的 docUid 并支持清空所有缓存", async () => {
    (bulkDeleteDocsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ deletedDocUids: [] });

    const store = useDocStore();
    await store.bulkDeleteDocs(["invalid-uid", "also-invalid", "another-bad-one"]);
    store.invalidateAllCache();

    expect(bulkDeleteDocsApi).not.toHaveBeenCalled();
    expect(store.cacheStats.detailHits).toBe(0);
    expect(store.cacheStats.detailMisses).toBe(0);
  });
});
