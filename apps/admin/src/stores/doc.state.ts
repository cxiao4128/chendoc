import { computed, ref } from "vue";
import type { DocDetail, DocSummary } from "@/services/api";

export function createDocStoreState() {
  const docs = ref<DocSummary[]>([]);
  const current = ref<DocDetail | null>(null);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const listPage = ref(1);
  const listPageSize = ref(30);
  const listHasMore = ref(false);
  const listError = ref<string | null>(null);
  const detailError = ref<string | null>(null);

  const cacheStats = ref({
    detailHits: 0,
    detailMisses: 0,
    listHits: 0,
    listMisses: 0,
  });

  const detailHitRate = computed(() => {
    const total = cacheStats.value.detailHits + cacheStats.value.detailMisses;
    return total > 0 ? cacheStats.value.detailHits / total : 0;
  });

  const listHitRate = computed(() => {
    const total = cacheStats.value.listHits + cacheStats.value.listMisses;
    return total > 0 ? cacheStats.value.listHits / total : 0;
  });

  return {
    docs,
    current,
    listLoading,
    detailLoading,
    listPage,
    listPageSize,
    listHasMore,
    listError,
    detailError,
    cacheStats,
    detailHitRate,
    listHitRate,
  };
}
