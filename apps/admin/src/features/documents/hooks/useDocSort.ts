/**
 * features/documents/hooks/useDocSort.ts
 *
 * 职责：文档列表排序
 */
import type { SortMode } from "../types";
import type { DocSummary } from "@/services/api";

export function useDocSort() {
  /**
   * 对文档列表排序
   */
  function sortDocs(docs: DocSummary[], sortMode: SortMode): DocSummary[] {
    return [...docs].sort((left, right) => {
      switch (sortMode) {
        case "titleAsc":
          return left.title.localeCompare(right.title, "zh-CN");
        case "createdDesc":
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        case "updatedDesc":
        default:
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
    });
  }

  return { sortDocs };
}
