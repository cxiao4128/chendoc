/**
 * features/documents/hooks/useDocFilterLogic.ts
 *
 * 职责：文档筛选逻辑（纯函数）
 * 与 useDocumentFilters.ts（UI 状态）职责分离
 */
import type { DocViewFilter, UpdatedFilter } from "../types";
import type { DocSummary } from "@/services/api";

/**
 * 解析文档标签
 */
function parseDocTags(tags: string[] | string | null | undefined): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags !== "string") return [];
  try { return JSON.parse(tags) as string[]; } catch { return []; }
}

/**
 * 文档筛选选项
 */
export interface DocFilterOptions {
  viewFilter: DocViewFilter;
  spaceFilter: string;
  tagFilter: string;
  updatedFilter: UpdatedFilter;
}

/**
 * 文档筛选 Hook
 */
export function useDocFilters() {
  /**
   * 应用筛选条件
   */
  function applyFilters(docs: DocSummary[], options: DocFilterOptions): DocSummary[] {
    const { viewFilter, spaceFilter, tagFilter, updatedFilter } = options;

    // 视图筛选
    let viewFiltered: DocSummary[];
    switch (viewFilter) {
      case "published":
        viewFiltered = docs.filter((doc) => doc.status === "published");
        break;
      case "shared":
        viewFiltered = docs.filter((doc) => doc.shareCode && doc.shareEnabled);
        break;
      case "review":
        viewFiltered = docs.filter((doc) => doc.shareReviewStatus === "pending");
        break;
      case "draft":
        viewFiltered = docs.filter((doc) => doc.status !== "published");
        break;
      case "unshared":
        viewFiltered = docs.filter((doc) => !doc.shareCode || !doc.shareEnabled);
        break;
      default:
        viewFiltered = docs;
    }

    // 时间筛选
    const cutoff = getUpdatedCutoff(updatedFilter);

    // 应用筛选
    return viewFiltered.filter((doc) => {
      // 空间筛选
      if (spaceFilter !== "all" && String(doc.spaceId || "none") !== spaceFilter) return false;

      // 标签筛选
      if (tagFilter !== "all") {
        const tags = parseDocTags(doc.tags);
        if (!tags.includes(tagFilter)) return false;
      }

      // 时间筛选
      return !cutoff || new Date(doc.updatedAt).getTime() >= cutoff;
    });
  }

  /**
   * 获取时间筛选截止点
   */
  function getUpdatedCutoff(filter: UpdatedFilter): number {
    switch (filter) {
      case "day": return Date.now() - 86_400_000;
      case "week": return Date.now() - 7 * 86_400_000;
      case "month": return Date.now() - 30 * 86_400_000;
      default: return 0;
    }
  }

  return {
    applyFilters,
    getUpdatedCutoff,
  };
}
