import { defineStore } from "pinia";
import { ref } from "vue";
import type { DocDetail, DocSummary } from "../api/docs";
import { bulkDeleteDocsApi, createDocApi, getDocApi, listDocsApi, updateDocApi } from "../api/docs";
import { getApiErrorMessage } from "../api/request";

const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;

interface DetailCacheEntry {
  doc: DocDetail;
  expiresAt: number;
}

const detailCache = new Map<string, DetailCacheEntry>();

function setDetailCache(doc: DocDetail) {
  detailCache.set(doc.docUid, {
    doc,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS
  });
}

function getDetailCache(docUid: string) {
  const cached = detailCache.get(docUid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(docUid);
    return null;
  }
  return cached.doc;
}

function pruneDetailCache() {
  const now = Date.now();
  for (const [docUid, cached] of detailCache) {
    if (cached.expiresAt <= now) detailCache.delete(docUid);
  }
}

export const useDocStore = defineStore("doc", () => {
  const docs = ref<DocSummary[]>([]);
  const current = ref<DocDetail | null>(null);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const listPage = ref(1);
  const listPageSize = ref(30);
  const listHasMore = ref(false);
  const loadingList = listLoading;
  const loadingDetail = detailLoading;
  const listError = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  let currentController: AbortController | null = null;
  let requestSeq = 0;

  async function loadList(q = "", options: { append?: boolean } = {}) {
    const page = options.append ? listPage.value + 1 : 1;
    listLoading.value = true;
    listError.value = null;
    try {
      const response = await listDocsApi({ q, page, pageSize: listPageSize.value });
      docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
      listPage.value = response.pagination?.page ?? page;
      listHasMore.value = response.pagination?.hasMore ?? false;
      pruneDetailCache();
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
    const cached = getDetailCache(docUid);
    if (cached) current.value = cached;
    else if (current.value?.docUid === docUid) current.value = null;

    currentController?.abort();
    currentController = new AbortController();
    const seq = ++requestSeq;
    detailLoading.value = !cached;
    detailError.value = null;
    try {
      const response = await getDocApi(docUid, currentController.signal);
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

  async function saveDoc(docUid: string, patch: Partial<DocDetail>) {
    detailError.value = null;
    const cached = current.value?.docUid === docUid ? current.value : getDetailCache(docUid);
    const response = await updateDocApi(docUid, {
      ...patch,
      expectedRevision: cached?.revision
    });
    current.value = response.doc;
    setDetailCache(response.doc);
    const index = docs.value.findIndex((item) => item.docUid === docUid);
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
  }

  async function bulkDeleteDocs(docUids: string[]) {
    detailError.value = null;
    const uniqueDocUids = Array.from(new Set(docUids)).filter((uid) => /^[A-Za-z0-9]{16,32}$/.test(uid));
    if (!uniqueDocUids.length) return [];
    const response = await bulkDeleteDocsApi(uniqueDocUids);
    const deletedUidSet = new Set(response.deletedDocUids);
    docs.value = docs.value.filter((item) => !deletedUidSet.has(item.docUid));
    for (const uid of deletedUidSet) detailCache.delete(uid);
    if (current.value && deletedUidSet.has(current.value.docUid)) current.value = null;
    return response.deletedDocUids;
  }

  return {
    docs,
    current,
    listLoading,
    detailLoading,
    listPage,
    listPageSize,
    listHasMore,
    loadingList,
    loadingDetail,
    listError,
    detailError,
    loadList,
    loadMore,
    loadDoc,
    createDoc,
    saveDoc,
    bulkDeleteDocs
  };
});
