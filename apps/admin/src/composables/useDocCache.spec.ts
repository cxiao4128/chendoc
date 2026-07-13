/**
 * useDocCache.ts 单元测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createDocCacheKey,
  createListCacheKey,
  checkRevisionConflict,
  createOptimisticUpdate,
  getCacheHitRate,
  resetCacheStats,
} from "./useDocCache";

describe("useDocCache", () => {
  describe("createDocCacheKey", () => {
    it("应为文档创建正确的缓存 key", () => {
      expect(createDocCacheKey("abc123")).toBe("doc:abc123");
      expect(createDocCacheKey("xyz789")).toBe("doc:xyz789");
    });
  });

  describe("createListCacheKey", () => {
    it("应创建包含所有参数的缓存 key", () => {
      expect(createListCacheKey("", 1, 30)).toBe("docs:list::1:30");
      expect(createListCacheKey("test", 2, 50)).toBe("docs:list:test:2:50");
    });
  });

  describe("checkRevisionConflict", () => {
    it("当本地 revision 未定义时应无冲突", () => {
      const result = checkRevisionConflict(undefined, 5);
      expect(result.hasConflict).toBe(false);
    });

    it("当本地 revision 小于服务器时应检测到冲突", () => {
      const result = checkRevisionConflict(3, 5);
      expect(result.hasConflict).toBe(true);
      expect(result.message).toContain("已被其他人修改");
    });

    it("当本地 revision 大于服务器时应检测到冲突", () => {
      const result = checkRevisionConflict(7, 5);
      expect(result.hasConflict).toBe(true);
      expect(result.message).toContain("版本冲突");
    });

    it("当本地 revision 等于服务器时应无冲突", () => {
      const result = checkRevisionConflict(5, 5);
      expect(result.hasConflict).toBe(false);
    });
  });

  describe("createOptimisticUpdate", () => {
    it("应创建乐观更新数据", () => {
      const localData = { title: "Original", content: "Hello", revision: 5 };
      const patch = { title: "Updated" };

      const result = createOptimisticUpdate(localData, patch);

      expect(result).toEqual({
        title: "Updated",
        content: "Hello",
        revision: 6,
      });
    });

    it("应保留未被 patch 的字段", () => {
      const localData = { title: "Original", content: "Hello", tags: ["a", "b"], revision: 1 };
      const patch = { content: "Updated content" };

      const result = createOptimisticUpdate(localData, patch);

      expect(result).toEqual({
        title: "Original",
        content: "Updated content",
        tags: ["a", "b"],
        revision: 2,
      });
    });

    it("应增加 revision", () => {
      const localData = { revision: 10 };
      const result = createOptimisticUpdate(localData, {});
      expect(result.revision).toBe(11);
    });
  });

  describe("getCacheHitRate", () => {
    beforeEach(() => {
      resetCacheStats();
    });

    it("当无请求时应返回 0", () => {
      const rate = getCacheHitRate();
      expect(rate.detail).toBe(0);
      expect(rate.list).toBe(0);
    });
  });
});