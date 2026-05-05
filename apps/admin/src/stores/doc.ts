import { defineStore } from "pinia";
import { ref } from "vue";
import type { DocDetail, DocSummary } from "../api/docs";
import { createDocApi, getDocApi, listDocsApi, updateDocApi } from "../api/docs";

const detailCache = new Map<number, DocDetail>();

export const useDocStore = defineStore("doc", () => {
  const docs = ref<DocSummary[]>([]);
  const current = ref<DocDetail | null>(null);
  const loadingList = ref(false);
  const loadingDetail = ref(false);
  let currentController: AbortController | null = null;
  let requestSeq = 0;

  async function loadList(q = "") {
    loadingList.value = true;
    try {
      const response = await listDocsApi({ q });
      docs.value = response.docs;
    } finally {
      loadingList.value = false;
    }
  }

  async function createDoc(title = "未命名文档") {
    const response = await createDocApi(title);
    detailCache.set(response.doc.id, response.doc);
    current.value = response.doc;
    await loadList();
    return response.doc;
  }

  async function loadDoc(id: number) {
    const cached = detailCache.get(id);
    if (cached) current.value = cached;

    currentController?.abort();
    currentController = new AbortController();
    const seq = ++requestSeq;
    loadingDetail.value = !cached;
    try {
      const response = await getDocApi(id, currentController.signal);
      if (seq === requestSeq) {
        current.value = response.doc;
        detailCache.set(id, response.doc);
      }
      return response.doc;
    } finally {
      if (seq === requestSeq) loadingDetail.value = false;
    }
  }

  async function saveDoc(id: number, patch: Partial<DocDetail>) {
    const response = await updateDocApi(id, patch);
    current.value = response.doc;
    detailCache.set(id, response.doc);
    const index = docs.value.findIndex((item) => item.id === id);
    if (index >= 0) {
      docs.value[index] = {
        ...docs.value[index],
        title: response.doc.title,
        pinned: response.doc.pinned,
        updatedAt: response.doc.updatedAt,
        status: response.doc.status
      };
    }
    return response.doc;
  }

  return { docs, current, loadingList, loadingDetail, loadList, loadDoc, createDoc, saveDoc };
});
