import { defineStore } from "pinia";
import { ref } from "vue";
import type { DocDetail, DocSummary } from "../api/docs";
import { createDocApi, getDocApi, listDocsApi, updateDocApi } from "../api/docs";
import { getApiErrorMessage } from "../api/request";

const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;

interface DetailCacheEntry {
  doc: DocDetail;
  expiresAt: number;
}

const detailCache = new Map<number, DetailCacheEntry>();

function setDetailCache(doc: DocDetail) {
  detailCache.set(doc.id, {
    doc,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS
  });
}

function getDetailCache(id: number) {
  const cached = detailCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(id);
    return null;
  }
  return cached.doc;
}

function pruneDetailCache() {
  const now = Date.now();
  for (const [id, cached] of detailCache) {
    if (cached.expiresAt <= now) detailCache.delete(id);
  }
}

export const useDocStore = defineStore("doc", () => {
  const docs = ref<DocSummary[]>([]);
  const current = ref<DocDetail | null>(null);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const loadingList = listLoading;
  const loadingDetail = detailLoading;
  const listError = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  let currentController: AbortController | null = null;
  let requestSeq = 0;

  async function loadList(q = "") {
    listLoading.value = true;
    listError.value = null;
    try {
      const response = await listDocsApi({ q });
      docs.value = response.docs;
      pruneDetailCache();
    } catch (error) {
      listError.value = getApiErrorMessage(error);
      throw error;
    } finally {
      listLoading.value = false;
    }
  }

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

  async function loadDoc(id: number) {
    const cached = getDetailCache(id);
    if (cached) current.value = cached;
    else if (current.value?.id === id) current.value = null;

    currentController?.abort();
    currentController = new AbortController();
    const seq = ++requestSeq;
    detailLoading.value = !cached;
    detailError.value = null;
    try {
      const response = await getDocApi(id, currentController.signal);
      if (seq === requestSeq) {
        current.value = response.doc;
        setDetailCache(response.doc);
      }
      return response.doc;
    } catch (error) {
      if (seq === requestSeq) detailError.value = getApiErrorMessage(error);
      throw error;
    } finally {
      if (seq === requestSeq) detailLoading.value = false;
    }
  }

  async function saveDoc(id: number, patch: Partial<DocDetail>) {
    detailError.value = null;
    try {
      const response = await updateDocApi(id, patch);
      current.value = response.doc;
      setDetailCache(response.doc);
      const index = docs.value.findIndex((item) => item.id === id);
      if (index >= 0) {
        docs.value[index] = {
          ...docs.value[index],
          title: response.doc.title,
          summary: response.doc.summary,
          pinned: response.doc.pinned,
          updatedAt: response.doc.updatedAt,
          status: response.doc.status
        };
      }
      return response.doc;
    } catch (error) {
      throw error;
    }
  }

  return {
    docs,
    current,
    listLoading,
    detailLoading,
    loadingList,
    loadingDetail,
    listError,
    detailError,
    loadList,
    loadDoc,
    createDoc,
    saveDoc
  };
});
