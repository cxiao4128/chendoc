/**
 * features/documents/hooks/useDocumentList.ts - 文档列表 Hook
 *
 * 重构说明：
 * - 从 DocListPage.vue 抽离列表相关逻辑
 * - 封装列表加载、筛选、错误处理
 * - 使用 doc store 提供的数据
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDocStore } from "../../../stores/doc";
import { normalizeError } from "../../../utils/error";
import type { DocViewFilter, SortMode, UpdatedFilter } from "../types";
import type { DocSummary } from "@/services/api";

// ============= 导出 Hook =============
export function useDocumentList() {
  const docs = useDocStore();
  const route = useRoute();

  // ============= 状态 =============

  /** 本地错误信息 */
  const localListError = ref("");

  // ============= 计算属性 =============

  /** 原始文档列表 */
  const allDocs = computed(() => docs.docs);

  /** URL query 参数 */
  const query = computed(() => String(route.query.q || "").trim());

  /** 列表错误文本 */
  const listErrorText = computed(() => normalizeError((docs as unknown as { listError?: unknown }).listError) || localListError.value);

  /** 是否正在加载 */
  const loadingList = computed(() => docs.loadingList);

  /** 是否有更多 */
  const listHasMore = computed(() => docs.listHasMore);

  /** 可见文档列表（需要外部传入筛选条件） */
  function getVisibleDocs(
    docs: DocSummary[],
    options: {
      viewFilter: DocViewFilter;
      spaceFilter: string;
      tagFilter: string;
      updatedFilter: UpdatedFilter;
      sortMode: SortMode;
    }
  ): DocSummary[] {
    const { viewFilter, spaceFilter, tagFilter, updatedFilter, sortMode } = options;

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
    const cutoff = updatedFilter === "day" ? Date.now() - 86_400_000
      : updatedFilter === "week" ? Date.now() - 7 * 86_400_000
        : updatedFilter === "month" ? Date.now() - 30 * 86_400_000 : 0;

    // 应用筛选并排序
    const filtered = viewFiltered.filter((doc) => {
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

    return [...filtered].sort((left, right) => {
      if (sortMode === "titleAsc") return left.title.localeCompare(right.title, "zh-CN");
      if (sortMode === "createdDesc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }

  /** 解析文档标签 */
  function parseDocTags(tags: string[] | string | null | undefined): string[] {
    if (Array.isArray(tags)) return tags;
    if (typeof tags !== "string") return [];
    try { return JSON.parse(tags) as string[]; } catch { return []; }
  }

  /** 预览文本处理 */
  function normalizePreview(value: string): string {
    return value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** 限制预览文本长度 */
  function clampPreview(text: string, keyword: string): string {
    const limit = 132;
    if (text.length <= limit) return text;
    if (!keyword) return `${text.slice(0, limit)}…`;
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) return `${text.slice(0, limit)}…`;
    const start = Math.max(0, index - 36);
    const end = Math.min(text.length, index + keyword.length + 84);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }

  /** 获取文档预览文本 */
  function docPreviewText(doc: { summary?: string | null; excerpt?: string | null; snippet?: string | null; contentText?: string | null; contentHtml?: string | null }): string {
    const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
    const text = normalizePreview(source);
    if (!text) return "";
    return clampPreview(text, query.value);
  }

  /** 获取文档预览文本（带高亮） */
  function docPreviewParts(doc: { summary?: string | null; excerpt?: string | null; snippet?: string | null; contentText?: string | null; contentHtml?: string | null }): Array<{ text: string; highlighted: boolean }> {
    const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
    const text = normalizePreview(source);
    if (!text) return [];
    const clamped = clampPreview(text, query.value);
    if (!query.value) return [{ text: clamped, highlighted: false }];
    const escaped = query.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return clamped.split(regex).filter(Boolean).map((part) => ({
      text: part,
      highlighted: part.toLowerCase() === query.value.toLowerCase()
    }));
  }

  // ============= 方法 =============

  /** 加载文档列表 */
  async function load() {
    localListError.value = "";
    try {
      await docs.loadList(query.value);
    } catch (error) {
      localListError.value = normalizeError(error) || "文档列表加载失败，请稍后重试。";
    }
  }

  /** 重试加载 */
  function retryLoad() {
    void load();
  }

  /** 加载更多 */
  function loadMore() {
    void docs.loadMore(query.value);
  }

  /** 创建文档 */
  async function createDoc(title = "未命名文档") {
    return await docs.createDoc(title);
  }

  /** 保存文档 */
  async function saveDoc(docUid: string, patch: Parameters<typeof docs.saveDoc>[1]) {
    return await docs.saveDoc(docUid, patch);
  }

  /** 批量删除 */
  async function bulkDeleteDocs(docUids: string[]) {
    return await docs.bulkDeleteDocs(docUids);
  }

  // ============= 监听 =============

  // URL query 变化时重新加载
  watch(() => route.query.q, load);

  return {
    // 状态
    allDocs,
    query,
    localListError,

    // 计算属性
    listErrorText,
    loadingList,
    listHasMore,

    // 工具函数
    parseDocTags,
    docPreviewText,
    docPreviewParts,
    normalizePreview,
    clampPreview,

    // 方法
    load,
    retryLoad,
    loadMore,
    createDoc,
    saveDoc,
    bulkDeleteDocs,
    getVisibleDocs,
  };
}
