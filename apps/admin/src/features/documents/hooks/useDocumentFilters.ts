/**
 * features/documents/hooks/useDocumentFilters.ts - 文档筛选状态 Hook
 *
 * 重构说明：
 * - 从 DocListPage.vue 抽离筛选状态逻辑
 * - 管理视图筛选、排序、空间/标签筛选、时间筛选
 * - 支持 localStorage 持久化
 */
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { DocViewFilter, SortMode, UpdatedFilter } from "../types";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";

// ============= 常量 =============
const FILTER_STORAGE_KEY = "chendoc_doc_filters";

interface StoredFilters {
  space?: string;
  tag?: string;
  updated?: UpdatedFilter;
}

// ============= 导出 Hook =============
export function useDocumentFilters() {
  const route = useRoute();
  const router = useRouter();
  const { docsPath } = useWorkspaceRoutes();

  // URL 参数
  const query = computed(() => String(route.query.q || "").trim());

  // 视图筛选
  const viewFilter = ref<DocViewFilter>("all");

  // 排序
  const sortMode = ref<SortMode>((route.query.sort as SortMode) || "updatedDesc");

  // 空间筛选
  const spaceFilter = ref("all");

  // 标签筛选
  const tagFilter = ref("all");

  // 时间筛选
  const updatedFilter = ref<UpdatedFilter>("all");

  // 搜索关键词（本地）
  const searchKeyword = ref(query.value);

  // 视图模式
  const viewMode = ref<"list" | "kanban">("list");

  // 看板分组
  const kanbanGroupBy = ref<"status" | "tag">("status");

  // 紧凑模式
  const compactMode = ref(false);

  // ============= 计算属性 =============

  /** 排序标签文本 */
  const sortLabel = computed(() => {
    if (sortMode.value === "createdDesc") return "按创建时间";
    if (sortMode.value === "titleAsc") return "按标题";
    return "按更新时间";
  });

  /** 是否展示所有者列 */
  const showOwnerColumn = ref(false);

  // ============= 方法 =============

  /** 循环切换排序模式 */
  function cycleSortMode() {
    sortMode.value = sortMode.value === "updatedDesc"
      ? "createdDesc"
      : sortMode.value === "createdDesc"
        ? "titleAsc"
        : "updatedDesc";
    // 排序状态 URL 持久化
    router.replace({ path: route.path, query: { ...route.query, sort: sortMode.value } });
  }

  /** 重置所有筛选 */
  function resetFilters() {
    viewFilter.value = "all";
    sortMode.value = "updatedDesc";
    searchKeyword.value = "";
    spaceFilter.value = "all";
    tagFilter.value = "all";
    updatedFilter.value = "all";
    router.replace({ path: docsPath.value });
  }

  /** 提交搜索 */
  function submitSearch() {
    const value = searchKeyword.value.trim();
    rememberSearch(value);
    router.push({ path: docsPath.value, query: value ? { q: value } : {} });
  }

  /** 队列搜索（防抖） */
  let searchTimer: number | null = null;
  function queueSearch(value: string) {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const normalized = value.trim();
      if (normalized === query.value) return;
      rememberSearch(normalized);
      router.replace({ path: docsPath.value, query: normalized ? { q: normalized } : {} });
    }, 280);
  }

  /** 清理搜索定时器 */
  function clearSearchTimer() {
    if (searchTimer) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  /** 最近搜索 */
  const recentSearches = ref<string[]>([]);

  /** 记住搜索历史 */
  function rememberSearch(value: string) {
    const next = value.trim();
    if (!next) return;
    recentSearches.value = [next, ...recentSearches.value.filter((item) => item !== next)].slice(0, 5);
    localStorage.setItem("chendoc_recent_searches", JSON.stringify(recentSearches.value));
  }

  // ============= 生命周期 =============

  /** 初始化 - 从 localStorage 恢复筛选状态 */
  function initFilters() {
    // 恢复筛选状态
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "{}") as StoredFilters;
      spaceFilter.value = saved.space || "all";
      tagFilter.value = saved.tag || "all";
      updatedFilter.value = ["all", "day", "week", "month"].includes(saved.updated || "") ? saved.updated! : "all";
    } catch {
      localStorage.removeItem(FILTER_STORAGE_KEY);
    }

    // 恢复最近搜索
    try {
      recentSearches.value = JSON.parse(localStorage.getItem("chendoc_recent_searches") || "[]");
    } catch {
      recentSearches.value = [];
    }
  }

  /** 持久化筛选状态到 localStorage */
  function persistFilters() {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      space: spaceFilter.value,
      tag: tagFilter.value,
      updated: updatedFilter.value,
    }));
  }

  // ============= 监听 =============

  // 同步 URL query 到本地搜索关键词
  watch(query, (value) => {
    searchKeyword.value = value;
  });

  // 搜索关键词变化时队列搜索
  watch(searchKeyword, queueSearch);

  // 筛选变化时持久化
  watch([spaceFilter, tagFilter, updatedFilter], persistFilters);

  return {
    // 状态
    query,
    viewFilter,
    sortMode,
    spaceFilter,
    tagFilter,
    updatedFilter,
    searchKeyword,
    viewMode,
    kanbanGroupBy,
    compactMode,
    recentSearches,
    showOwnerColumn,

    // 计算属性
    sortLabel,

    // 方法
    cycleSortMode,
    resetFilters,
    submitSearch,
    queueSearch,
    clearSearchTimer,
    rememberSearch,
    initFilters,
    persistFilters,
  };
}
