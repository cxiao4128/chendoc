/**
 * features/documents/hooks/useDocListState.ts
 *
 * 职责：文档列表状态管理（加载、分页、错误）
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDocStore } from "../../../stores/doc";
import { normalizeError } from "../../../utils/error";

// 重新导出 doc store 的类型
export type { DocSummary } from "@/services/api";

export function useDocListState() {
  const docStore = useDocStore();
  const route = useRoute();

  // ============= 状态 =============

  /** 本地错误信息 */
  const localError = ref("");

  // ============= 计算属性 =============

  /** 原始文档列表 */
  const docs = computed(() => docStore.docs);

  /** URL query 参数 */
  const query = computed(() => String(route.query.q || "").trim());

  /** 列表错误文本 */
  const errorText = computed(() =>
    normalizeError((docStore as unknown as { listError?: unknown }).listError) || localError.value
  );

  /** 是否正在加载 */
  const loading = computed(() => docStore.loadingList);

  /** 是否有更多 */
  const hasMore = computed(() => docStore.listHasMore);

  // ============= 方法 =============

  /** 加载文档列表 */
  async function load() {
    localError.value = "";
    try {
      await docStore.loadList(query.value);
    } catch (error) {
      localError.value = normalizeError(error) || "文档列表加载失败，请稍后重试。";
    }
  }

  /** 重试加载 */
  function retry() {
    void load();
  }

  /** 加载更多 */
  function loadMore() {
    void docStore.loadMore(query.value);
  }

  // ============= 监听 =============

  // URL query 变化时重新加载
  watch(() => route.query.q, load, { immediate: true });

  return {
    // 状态
    docs,
    query,
    localError,
    errorText,
    loading,
    hasMore,

    // 方法
    load,
    retry,
    loadMore,
  };
}
