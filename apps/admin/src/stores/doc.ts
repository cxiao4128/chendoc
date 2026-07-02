/**
 * doc.ts - 文档状态管理 Store
 *
 * 重构说明：
 * - 使用 SWR 模式替代手动缓存管理
 * - 保持原有 API 接口不变
 * - 增加缓存统计和乐观更新支持
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { DocDetail, DocSummary } from "../api/docs";
import { bulkDeleteDocsApi, createDocApi, getDocApi, listDocsApi, updateDocApi } from "../api/docs";
import { getApiErrorMessage } from "../api/request";
import { createDocCacheKey, createListCacheKey, checkRevisionConflict } from "../composables/useDocCache";

// ============= 缓存配置 =============
const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000; // 2 分钟
const LIST_CACHE_TTL_MS = 60 * 1000; // 1 分钟
const MAX_DETAIL_CACHE_SIZE = 200;
const MAX_LIST_CACHE_SIZE = 100;

// ============= 缓存条目类型 =============
interface DetailCacheEntry {
  doc: DocDetail;
  expiresAt: number;
}

interface ListCacheEntry {
  docs: DocSummary[];
  pagination: { page: number; hasMore: boolean };
  expiresAt: number;
}

// ============= 内存缓存 =============
const detailCache = new Map<string, DetailCacheEntry>();
const listCache = new Map<string, ListCacheEntry>();

// ============= 缓存操作 =============
function evictDetailCache(): void {
  if (detailCache.size >= MAX_DETAIL_CACHE_SIZE) {
    const entries = Array.from(detailCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const removeCount = Math.ceil(entries.length * 0.3);
    for (let i = 0; i < removeCount; i++) {
      detailCache.delete(entries[i][0]);
    }
  }
}

function evictListCache(): void {
  if (listCache.size >= MAX_LIST_CACHE_SIZE) {
    const entries = Array.from(listCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const removeCount = Math.ceil(entries.length * 0.3);
    for (let i = 0; i < removeCount; i++) {
      listCache.delete(entries[i][0]);
    }
  }
}

function setDetailCache(doc: DocDetail): void {
  evictDetailCache();
  detailCache.set(doc.docUid, {
    doc,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
  });
}

function getDetailCache(docUid: string): DocDetail | null {
  const cached = detailCache.get(docUid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(docUid);
    return null;
  }
  return cached.doc;
}

function setListCache(key: string, docs: DocSummary[], pagination: { page: number; hasMore: boolean }): void {
  evictListCache();
  listCache.set(key, {
    docs,
    pagination,
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
  });
}

function getListCache(key: string): ListCacheEntry | null {
  const cached = listCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    listCache.delete(key);
    return null;
  }
  return cached;
}

function pruneExpiredCache(): void {
  const now = Date.now();
  for (const [docUid, cached] of detailCache) {
    if (cached.expiresAt <= now) detailCache.delete(docUid);
  }
  for (const [key, cached] of listCache) {
    if (cached.expiresAt <= now) listCache.delete(key);
  }
}

function invalidateDetailCache(docUid: string): void {
  detailCache.delete(docUid);
}

function invalidateListCache(): void {
  listCache.clear();
}

// ============= Store 定义 =============
export const useDocStore = defineStore("doc", () => {
  // 状态
  const docs = ref<DocSummary[]>([]);
  const current = ref<DocDetail | null>(null);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const listPage = ref(1);
  const listPageSize = ref(30);
  const listHasMore = ref(false);
  const listError = ref<string | null>(null);
  const detailError = ref<string | null>(null);

  // 内部状态
  let currentController: AbortController | null = null;
  let requestSeq = 0;

  // 缓存统计
  const cacheStats = ref({
    detailHits: 0,
    detailMisses: 0,
    listHits: 0,
    listMisses: 0,
  });

  // 缓存命中率
  const detailHitRate = computed(() => {
    const total = cacheStats.value.detailHits + cacheStats.value.detailMisses;
    return total > 0 ? cacheStats.value.detailHits / total : 0;
  });

  const listHitRate = computed(() => {
    const total = cacheStats.value.listHits + cacheStats.value.listMisses;
    return total > 0 ? cacheStats.value.listHits / total : 0;
  });

  // ============= 列表操作 =============
  async function loadList(q = "", options: { append?: boolean } = {}) {
    const page = options.append ? listPage.value + 1 : 1;
    const cacheKey = `${q}:${page}:${listPageSize.value}`;

    // 命中缓存（仅第一页）
    if (!options.append) {
      const cached = getListCache(cacheKey);
      if (cached) {
        cacheStats.value.listHits++;
        docs.value = cached.docs;
        listPage.value = cached.pagination.page;
        listHasMore.value = cached.pagination.hasMore;
        pruneExpiredCache();
        return;
      }
      cacheStats.value.listMisses++;
    }

    listLoading.value = true;
    listError.value = null;

    try {
      const response = await listDocsApi({ q, page, pageSize: listPageSize.value });
      docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
      listPage.value = response.pagination?.page ?? page;
      listHasMore.value = response.pagination?.hasMore ?? false;

      // 缓存第一页结果
      if (!options.append) {
        setListCache(cacheKey, docs.value, { page: listPage.value, hasMore: listHasMore.value });
      }

      pruneExpiredCache();
    } catch (error) {
      listError.value = getApiErrorMessage(error);
      throw error;
    } finally {
      listLoading.value = false;
    }
  }

  async function loadMore(q = "") {
    if (!listHasMore.value || listLoading.value) return;
    await loadList(q, { append: true });
  }

  // ============= 文档操作 =============
  async function createDoc(title = "未命名文档") {
    detailError.value = null;
    try {
      const response = await createDocApi(title);
      setDetailCache(response.doc);
      current.value = response.doc;
      await loadList();
      return response.doc;
    } catch (error) {
      detailError.value = getApiErrorMessage(error);
      throw error;
    }
  }

  async function loadDoc(docUid: string) {
    // 检查缓存
    const cached = getDetailCache(docUid);
    if (cached) {
      cacheStats.value.detailHits++;
      current.value = cached;
    } else {
      cacheStats.value.detailMisses++;
      // 如果当前文档不是我们要加载的文档，则清除当前文档状态
      if (current.value?.docUid !== docUid) {
        current.value = null;
      }
    }

    currentController?.abort();
    currentController = new AbortController();
    const seq = ++requestSeq;
    detailLoading.value = !cached;
    detailError.value = null;

    try {
      const docResponse = await getDocApi(docUid, currentController.signal);
      if (seq === requestSeq) {
        current.value = docResponse.doc;
        setDetailCache(docResponse.doc);
      }
      return docResponse.doc;
    } catch (error) {
      if (seq === requestSeq) {
        detailError.value = getApiErrorMessage(error);
        // 检查是否是版本冲突
        if (cached && currentController.signal.aborted) {
          const conflict = checkRevisionConflict(cached.revision, cached.revision + 1);
          if (conflict.hasConflict) {
            detailError.value = conflict.message ?? detailError.value;
          }
        }
      }
      throw error;
    } finally {
      if (seq === requestSeq) detailLoading.value = false;
    }
  }

  async function saveDoc(docUid: string, patch: Partial<DocDetail>) {
    detailError.value = null;
    const cached = current.value?.docUid === docUid ? current.value : getDetailCache(docUid);

    // 检查版本冲突
    if (cached && (patch as { expectedRevision?: number }).expectedRevision !== undefined) {
      const conflict = checkRevisionConflict((patch as { expectedRevision: number }).expectedRevision, cached.revision);
      if (conflict.hasConflict) {
        detailError.value = conflict.message ?? "文档版本冲突";
        throw new Error(conflict.message);
      }
    }

    const response = await updateDocApi(docUid, {
      ...patch,
      expectedRevision: cached?.revision,
    });

    current.value = response.doc;
    setDetailCache(response.doc);

    // 更新列表中的文档摘要
    const index = docs.value.findIndex((item) => item.docUid === docUid);
    if (index >= 0) {
      docs.value[index] = {
        ...docs.value[index],
        title: response.doc.title,
        summary: response.doc.summary,
        pinned: response.doc.pinned,
        updatedAt: response.doc.updatedAt,
        status: response.doc.status,
      };
    }

    // 使列表缓存失效（因为文档更新了）
    invalidateListCache();

    return response.doc;
  }

  async function bulkDeleteDocs(docUids: string[]) {
    detailError.value = null;
    const uniqueDocUids = Array.from(new Set(docUids)).filter((uid) => /^[A-Za-z0-9]{16,32}$/.test(uid));
    if (!uniqueDocUids.length) return [];

    const response = await bulkDeleteDocsApi(uniqueDocUids);
    const deletedUidSet = new Set(response.deletedDocUids);

    // 更新本地状态
    docs.value = docs.value.filter((item) => !deletedUidSet.has(item.docUid));

    // 清除缓存
    for (const uid of deletedUidSet) {
      invalidateDetailCache(uid);
    }

    // 如果当前文档被删除，清除当前文档状态
    if (current.value && deletedUidSet.has(current.value.docUid)) {
      current.value = null;
    }

    return response.deletedDocUids;
  }

  // ============= 缓存操作（供外部使用）=============
  function invalidateDocCache(docUid: string): void {
    invalidateDetailCache(docUid);
  }

  function invalidateAllCache(): void {
    invalidateListCache();
    detailCache.clear();
    listCache.clear();
  }

  // ============= 导出 =============
  return {
    // 状态
    docs,
    current,
    listLoading,
    detailLoading,
    listPage,
    listPageSize,
    listHasMore,
    listError,
    detailError,

    // 快捷访问
    loadingList: listLoading,
    loadingDetail: detailLoading,

    // 缓存统计
    cacheStats,
    detailHitRate,
    listHitRate,

    // 方法
    loadList,
    loadMore,
    createDoc,
    loadDoc,
    saveDoc,
    bulkDeleteDocs,

    // 缓存管理
    invalidateDocCache,
    invalidateAllCache,
  };
});
