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

import { listDocsApi, createDocApi, searchDocsApi } from "../services/api/document.api";

describe("useDocStore 列表与创建", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });

  it("应加载文档列表", async () => {
    const mockDocs = [
      { docUid: "doc1", title: "Doc 1", summary: "Summary 1", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "" },
      { docUid: "doc2", title: "Doc 2", summary: "Summary 2", status: "draft", pinned: false, wordCount: 200, createdAt: "", updatedAt: "" },
    ];
    (listDocsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: mockDocs, pagination: { page: 1, hasMore: false } });

    const store = useDocStore();
    await store.loadList();

    expect(listDocsApi).toHaveBeenCalled();
    expect(store.docs).toEqual(mockDocs);
    expect(store.listLoading).toBe(false);
    expect(store.listError).toBeNull();
  });

  it("应在加载失败时设置错误", async () => {
    (listDocsApi as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const store = useDocStore();
    await expect(store.loadList()).rejects.toThrow("Network error");
    expect(store.listError).toBe("Network error");
  });

  it("应支持追加模式加载更多并缓存列表", async () => {
    const mockDocs1 = [{ docUid: "doc1", title: "Doc 1", summary: "", status: "published", pinned: false, wordCount: 100, createdAt: "", updatedAt: "" }];
    const mockDocs2 = [{ docUid: "doc2", title: "Doc 2", summary: "", status: "published", pinned: false, wordCount: 200, createdAt: "", updatedAt: "" }];
    (listDocsApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ docs: mockDocs1, pagination: { page: 1, hasMore: true } })
      .mockResolvedValueOnce({ docs: mockDocs2, pagination: { page: 2, hasMore: false } });

    const store = useDocStore();
    await store.loadList();
    expect(store.docs).toHaveLength(1);
    await store.loadMore();

    expect(store.docs).toHaveLength(2);
    expect(store.listHasMore).toBe(false);
    expect(listDocsApi).toHaveBeenCalledTimes(2);
  });

  it("应创建新文档", async () => {
    const mockDoc = { docUid: "new-doc", title: "New Doc", summary: "", status: "draft", pinned: false, wordCount: 0, createdAt: "", updatedAt: "", revision: 1 };
    (createDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: mockDoc });
    (listDocsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ docs: [mockDoc], pagination: { page: 1, hasMore: false } });

    const store = useDocStore();
    const result = await store.createDoc("New Doc");

    expect(createDocApi).toHaveBeenCalledWith("New Doc");
    expect(result).toEqual(mockDoc);
    expect(store.current).toEqual(mockDoc);
  });

  it("创建文档后强制刷新已缓存的列表", async () => {
    const oldDoc = { docUid: "old-doc", title: "Old", summary: "", status: "draft", pinned: false, wordCount: 0, createdAt: "", updatedAt: "", revision: 1 };
    const newDoc = { docUid: "new-doc", title: "New", summary: "", status: "draft", pinned: false, wordCount: 0, createdAt: "", updatedAt: "", revision: 1 };
    (listDocsApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ docs: [oldDoc], pagination: { page: 1, hasMore: false } })
      .mockResolvedValueOnce({ docs: [newDoc, oldDoc], pagination: { page: 1, hasMore: false } });
    (createDocApi as ReturnType<typeof vi.fn>).mockResolvedValue({ doc: newDoc });

    const store = useDocStore();
    await store.loadList();
    await store.createDoc("New");

    expect(listDocsApi).toHaveBeenCalledTimes(2);
    expect(store.docs.map((doc) => doc.docUid)).toEqual(["new-doc", "old-doc"]);
  });

  it("较慢的旧查询响应不能覆盖新查询结果", async () => {
    let resolveOld!: (value: { docs: Array<Record<string, unknown>>; pagination: { page: number; hasMore: boolean } }) => void;
    let resolveNew!: (value: { docs: Array<Record<string, unknown>>; pagination: { page: number; hasMore: boolean } }) => void;
    const oldResponse = new Promise<{ docs: Array<Record<string, unknown>>; pagination: { page: number; hasMore: boolean } }>((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise<{ docs: Array<Record<string, unknown>>; pagination: { page: number; hasMore: boolean } }>((resolve) => { resolveNew = resolve; });
    (searchDocsApi as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(oldResponse)
      .mockReturnValueOnce(newResponse);

    const store = useDocStore();
    const oldLoading = store.loadList("old");
    const newLoading = store.loadList("new");
    resolveNew({
      docs: [{ docUid: "new-result", title: "New", status: "draft", revision: 1, sort: 0, spaceId: null, parentId: null, createdAt: "", updatedAt: "" }],
      pagination: { page: 1, hasMore: false },
    });
    await newLoading;
    resolveOld({
      docs: [{ docUid: "old-result", title: "Old", status: "draft", revision: 1, sort: 0, spaceId: null, parentId: null, createdAt: "", updatedAt: "" }],
      pagination: { page: 1, hasMore: false },
    });
    await oldLoading;

    expect(store.docs.map((doc) => doc.docUid)).toEqual(["new-result"]);
    expect(store.listLoading).toBe(false);
  });
});
