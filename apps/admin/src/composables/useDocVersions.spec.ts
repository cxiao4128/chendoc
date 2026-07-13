/**
 * useDocVersions.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDocVersions } from "./useDocVersions";

// Mock API
vi.mock("../api/docs", async () => {
  const actual = await vi.importActual("../api/docs");
  return {
    ...actual,
    listDocVersionsApi: vi.fn(),
    getDocVersionPreviewApi: vi.fn(),
    restoreDocVersionApi: vi.fn(),
    restoreDocVersionAsCopyApi: vi.fn(),
  };
});

// Mock doc store
vi.mock("../stores/doc", () => ({
  useDocStore: () => ({
    loadDoc: vi.fn().mockResolvedValue({ docUid: "test" }),
  }),
}));

import {
  listDocVersionsApi,
  getDocVersionPreviewApi,
  restoreDocVersionApi,
  restoreDocVersionAsCopyApi,
} from "../api/docs";

describe("useDocVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadVersions", () => {
    it("应加载版本列表", async () => {
      const mockVersions = [
        { id: 3, title: "v3", createdAt: "2024-01-03", author: "user1", wordCount: 100, status: "published" },
        { id: 2, title: "v2", createdAt: "2024-01-02", author: "user1", wordCount: 90, status: "published" },
        { id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", wordCount: 80, status: "draft" },
      ];
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ versions: mockVersions });

      const { loadVersions, versions, loading, error } = useDocVersions();
      const result = await loadVersions("doc123");

      expect(listDocVersionsApi).toHaveBeenCalledWith("doc123");
      expect(versions.value).toEqual(mockVersions);
      expect(loading.value).toBe(false);
      expect(error.value).toBeNull();
      expect(result).toEqual(mockVersions);
    });

    it("应在加载失败时设置错误", async () => {
      const testError = new Error("Failed to load versions");
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockRejectedValue(testError);

      const { loadVersions, error } = useDocVersions();

      await expect(loadVersions("doc123")).rejects.toThrow("Failed to load versions");
      expect(error.value).toBe("Failed to load versions");
    });

    it("应在加载完成后调用 onLoaded 回调", async () => {
      const mockVersions = [{ id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", wordCount: 100, status: "published" }];
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ versions: mockVersions });

      const onLoaded = vi.fn();
      const { loadVersions } = useDocVersions({ onLoaded });

      await loadVersions("doc123");

      expect(onLoaded).toHaveBeenCalledWith(mockVersions);
    });
  });

  describe("previewVersion", () => {
    it("应加载版本预览", async () => {
      const mockVersion = {
        id: 2,
        title: "v2",
        createdAt: "2024-01-02",
        author: "user1",
        authorName: "user1",
        wordCount: 90,
        status: "published" as const,
        content: "<p>Preview content</p>",
        diffSummary: "",
      };
      (getDocVersionPreviewApi as ReturnType<typeof vi.fn>).mockResolvedValue({ version: mockVersion });

      const { previewVersion, selectedVersion, previewLoading } = useDocVersions();
      const result = await previewVersion("doc123", mockVersion);

      expect(getDocVersionPreviewApi).toHaveBeenCalledWith("doc123", mockVersion.id);
      expect(selectedVersion.value).toEqual(mockVersion);
      expect(previewLoading.value).toBe(false);
      expect(result).toEqual(mockVersion);
    });
  });

  describe("restoreVersion", () => {
    it("应恢复版本并重新加载文档", async () => {
      const mockVersion = { id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", authorName: "user1", wordCount: 80, status: "published" as const, diffSummary: "" };
      (restoreDocVersionApi as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ versions: [mockVersion] });

      const { restoreVersion, selectedVersion } = useDocVersions();

      const result = await restoreVersion("doc123", mockVersion);

      expect(restoreDocVersionApi).toHaveBeenCalledWith("doc123", mockVersion.id);
      expect(selectedVersion.value).toBeNull();
      expect(result).toEqual(mockVersion);
    });
  });

  describe("restoreAsCopy", () => {
    it("应创建文档副本", async () => {
      const mockVersion = { id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", authorName: "user1", wordCount: 80, status: "published" as const, diffSummary: "" };
      const mockResponse = { doc: { docUid: "new-doc", title: "v1 (副本)" } };
      (restoreDocVersionAsCopyApi as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const { restoreAsCopy } = useDocVersions();
      const result = await restoreAsCopy("doc123", mockVersion);

      expect(restoreDocVersionAsCopyApi).toHaveBeenCalledWith("doc123", mockVersion.id);
      expect(result).toEqual({ docUid: "new-doc", title: "v1 (副本)" });
    });
  });

  describe("辅助方法", () => {
    beforeEach(async () => {
      const mockVersions = [
        { id: 3, title: "v3", createdAt: "2024-01-03", author: "user1", wordCount: 100, status: "published" as const },
        { id: 2, title: "v2", createdAt: "2024-01-02", author: "user1", wordCount: 90, status: "published" as const },
        { id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", wordCount: 80, status: "published" as const },
      ];
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ versions: mockVersions });

      const { loadVersions } = useDocVersions();
      await loadVersions("doc123");
    });

    it("getVersionById 应返回正确的版本", () => {
      const { getVersionById } = useDocVersions();
      expect(getVersionById(2)).toBeDefined();
      expect(getVersionById(2)?.title).toBe("v2");
      expect(getVersionById(999)).toBeUndefined();
    });

    it("getLatestVersion 应返回最新版本", () => {
      const { getLatestVersion } = useDocVersions();
      const latest = getLatestVersion();
      expect(latest?.id).toBe(3);
    });

    it("isCurrentVersion 应正确判断", () => {
      const { getVersionById, isCurrentVersion } = useDocVersions();
      const version = getVersionById(2)!;

      expect(isCurrentVersion(version)).toBe(false);

      const { previewVersion } = useDocVersions();
      void previewVersion("doc123", version);

      expect(isCurrentVersion(version)).toBe(true);
    });

    it("formatDate 应格式化日期", () => {
      const { formatDate } = useDocVersions();
      const formatted = formatDate("2024-01-15T10:30:00Z");
      expect(formatted).toContain("2024");
    });

    it("formatWordCount 应格式化字数", () => {
      const { formatWordCount } = useDocVersions();
      expect(formatWordCount(1234)).toBe("1234 字");
    });
  });

  describe("reset", () => {
    it("应重置所有状态", async () => {
      const mockVersions = [{ id: 1, title: "v1", createdAt: "2024-01-01", author: "user1", wordCount: 100, status: "published" as const }];
      (listDocVersionsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ versions: mockVersions });

      const { loadVersions, reset, versions, loading, error } = useDocVersions();
      await loadVersions("doc123");

      expect(versions.value.length).toBe(1);

      reset();

      expect(versions.value).toEqual([]);
      expect(loading.value).toBe(false);
      expect(error.value).toBeNull();
    });
  });
});