/**
 * doc.ts - 文档状态管理 Store
 *
 * 重构说明：
 * - 使用 SWR 模式替代手动缓存管理
 * - 保持原有 API 接口不变
 * - 增加缓存统计和乐观更新支持
 */
import { defineStore } from "pinia";
import type { DocDetail } from "@/services/api";
import { getApiErrorMessage } from "../services/api";
import { bulkDeleteDocsApi, createDocApi, getDocApi, listDocsApi, searchDocsApi, updateDocApi } from "../services/api/document.api";
import { checkRevisionConflict } from "../composables/useDocCache";
import {
  clearDocStoreCache,
  getDetailCache,
  getListCache,
  invalidateDetailCache,
  invalidateListCache,
  pruneExpiredCache,
  setDetailCache,
  setListCache,
} from "./doc.cache";
import { createDocStoreState } from "./doc.state";

// ============= Store 定义 =============
export const useDocStore = defineStore("doc", () => {
  clearDocStoreCache();

  const state = createDocStoreState();
  const {
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
  } = state;

  // 内部状态
  let currentController: AbortController | null = null;
  let requestSeq = 0;
  let listRequestSeq = 0;

  async function loadList(q = "", options: { append?: boolean; force?: boolean } = {}) {
    const seq = ++listRequestSeq;
    const page = options.append ? listPage.value + 1 : 1;
    const cacheKey = `${q}:${page}:${listPageSize.value}`;

    if (options.force) {
      invalidateListCache();
    }

    if (!options.append && !options.force) {
      const cached = getListCache(cacheKey);
      if (cached) {
        cacheStats.value.listHits++;
        docs.value = cached.docs;
        listPage.value = cached.pagination.page;
        listHasMore.value = cached.pagination.hasMore;
        listLoading.value = false;
        listError.value = null;
        pruneExpiredCache();
        return;
      }
      cacheStats.value.listMisses++;
    }

    listLoading.value = true;
    listError.value = null;

    try {
      const response = q
        ? await searchDocsApi({ q, page, pageSize: listPageSize.value })
        : await listDocsApi({ page, pageSize: listPageSize.value });
      if (seq !== listRequestSeq) return;
      docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
      listPage.value = response.pagination?.page ?? page;
      listHasMore.value = response.pagination?.hasMore ?? false;

      if (!options.append) {
        setListCache(cacheKey, docs.value, { page: listPage.value, hasMore: listHasMore.value });
      }

      pruneExpiredCache();
    } catch (error) {
      if (seq === listRequestSeq) listError.value = getApiErrorMessage(error);
      throw error;
    } finally {
      if (seq === listRequestSeq) listLoading.value = false;
    }
  }

  async function loadMore(q = "") {
    if (!listHasMore.value || listLoading.value) return;
    await loadList(q, { append: true });
  }

  async function createDoc(title = "未命名文档") {
    detailError.value = null;
    try {
      const response = await createDocApi(title);
      setDetailCache(response.doc);
      current.value = response.doc;
      await loadList("", { force: true });
      return response.doc;
    } catch (error) {
      detailError.value = getApiErrorMessage(error);
      throw error;
    }
  }

  async function loadDoc(docUid: string, options: { force?: boolean } = {}) {
    if (!options.force) {
      const cached = getDetailCache(docUid);
      if (cached) {
        cacheStats.value.detailHits++;
        current.value = cached;
        return cached;
      }
    }
    cacheStats.value.detailMisses++;
    if (current.value?.docUid !== docUid) {
      current.value = null;
    }

    currentController?.abort();
    currentController = new AbortController();
    const seq = ++requestSeq;
    detailLoading.value = true;
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
        const cachedDoc = getDetailCache(docUid);
        if (cachedDoc && currentController.signal.aborted) {
          const conflict = checkRevisionConflict(cachedDoc.revision, cachedDoc.revision + 1);
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

    if (cached && (patch as { expectedRevision?: number }).expectedRevision !== undefined) {
      const conflict = checkRevisionConflict((patch as { expectedRevision: number }).expectedRevision, cached.revision);
      if (conflict.hasConflict) {
        detailError.value = `版本冲突：${conflict.message ?? "文档版本冲突"}`;
        throw new Error(conflict.message);
      }
    }

    const response = await updateDocApi(docUid, {
      ...patch,
      expectedRevision: cached?.revision,
    });

    if (current.value?.docUid === docUid) {
      current.value = response.doc;
    }
    setDetailCache(response.doc);

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

    invalidateListCache();

    return response.doc;
  }

  async function bulkDeleteDocs(docUids: string[]) {
    detailError.value = null;
    const uniqueDocUids = Array.from(new Set(docUids)).filter((uid) => /^[A-Za-z0-9]{1,32}$/.test(uid));
    if (!uniqueDocUids.length) return [];

    const response = await bulkDeleteDocsApi(uniqueDocUids);
    const deletedUidSet = new Set(response.deletedDocUids);

    docs.value = docs.value.filter((item) => !deletedUidSet.has(item.docUid));

    for (const uid of deletedUidSet) {
      invalidateDetailCache(uid);
    }

    if (current.value && deletedUidSet.has(current.value.docUid)) {
      current.value = null;
    }
    invalidateListCache();

    return response.deletedDocUids;
  }

  function invalidateDocCache(docUid: string): void {
    invalidateDetailCache(docUid);
  }

  function invalidateDocListCache(): void {
    invalidateListCache();
  }

  function invalidateAllCache(): void {
    clearDocStoreCache();
    cacheStats.value = {
      detailHits: 0,
      detailMisses: 0,
      listHits: 0,
      listMisses: 0,
    };
  }

  return {
    ...state,

    // 快捷访问
    loadingList: listLoading,
    loadingDetail: detailLoading,

    // 方法
    loadList,
    loadMore,
    createDoc,
    loadDoc,
    saveDoc,
    bulkDeleteDocs,

    // 缓存管理
    invalidateDocCache,
    invalidateDocListCache,
    invalidateAllCache,
  };
});
