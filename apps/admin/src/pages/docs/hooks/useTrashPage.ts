import { computed, onMounted, ref, watch } from "vue";
import {
  bulkHardDeleteTrashDocsApi,
  bulkRestoreTrashDocsApi,
  getTrashStatsApi,
  hardDeleteDocApi,
  listTrashDocsApi,
  restoreDocApi,
  type DocSummary,
  type TrashStats
} from "@/services/api";
import { useDocStore } from "../../../stores/doc";

export function useTrashPage() {
  const docStore = useDocStore();
  const docs = ref<DocSummary[]>([]);
  const loading = ref(false);
  const operating = ref(false);
  const removing = ref<DocSummary | null>(null);
  const bulkRestoring = ref(false);
  const bulkRemoving = ref(false);
  const selectedDocUids = ref<string[]>([]);
  const page = ref(1);
  const hasMore = ref(false);
  const timeFilter = ref<"all" | "today" | "week" | "month">("all");
  const newestFirst = ref(true);
  const trashStats = ref<TrashStats | null>(null);

  const selectedCount = computed(() => selectedDocUids.value.length);
  const recoverableCount = computed(() => docs.value.length);
  const trashRetentionDays = computed(() => trashStats.value?.retentionDays ?? 7);
  const releaseSize = computed(() => {
    if (!trashStats.value) return 0;
    return Math.round(trashStats.value.storageUsedBytes / (1024 * 1024 * 1024) * 10) / 10;
  });
  const storagePercent = computed(() => {
    if (!trashStats.value) return 0;
    return Math.min(100, Math.round((trashStats.value.storageUsedBytes / trashStats.value.storageTotalBytes) * 100));
  });
  const usedStorageText = computed(() => {
    if (!trashStats.value) return "--";
    return `${formatBytes(trashStats.value.storageUsedBytes)} / ${formatBytes(trashStats.value.storageTotalBytes)}`;
  });
  const filteredDocs = computed(() => {
    const filtered = timeFilter.value === "all" ? docs.value : docs.value.filter((doc) => {
      if (!doc.deletedAt) return false;
      const diffDays = (Date.now() - new Date(doc.deletedAt).getTime()) / 86_400_000;
      if (timeFilter.value === "today") return diffDays < 1;
      if (timeFilter.value === "week") return diffDays < 7;
      if (timeFilter.value === "month") return diffDays < 30;
      return true;
    });
    return [...filtered].sort((left, right) => {
      const delta = new Date(right.deletedAt || 0).getTime() - new Date(left.deletedAt || 0).getTime();
      return newestFirst.value ? delta : -delta;
    });
  });
  const filteredDocUids = computed(() => filteredDocs.value.map((doc) => doc.docUid));
  const filteredDocUidSet = computed(() => new Set(filteredDocUids.value));
  const allSelected = computed(() => (
    filteredDocUids.value.length > 0
    && filteredDocUids.value.every((docUid) => selectedDocUids.value.includes(docUid))
  ));

  watch(filteredDocUids, (docUids) => {
    const visibleUidSet = new Set(docUids);
    selectedDocUids.value = selectedDocUids.value.filter((uid) => visibleUidSet.has(uid));
  });

  async function load(options: { append?: boolean } = {}) {
    const nextPage = options.append ? page.value + 1 : 1;
    loading.value = true;
    try {
      const response = await listTrashDocsApi({ page: nextPage, pageSize: 30 });
      docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
      page.value = response.pagination?.page ?? nextPage;
      hasMore.value = response.pagination?.hasMore ?? false;
      selectedDocUids.value = selectedDocUids.value.filter((uid) => docs.value.some((doc) => doc.docUid === uid));
    } finally {
      loading.value = false;
    }
  }

  function loadMore() {
    if (!hasMore.value || loading.value) return;
    void load({ append: true });
  }

  function removeDocs(docUids: string[]) {
    const uidSet = new Set(docUids);
    docs.value = docs.value.filter((doc) => !uidSet.has(doc.docUid));
    selectedDocUids.value = selectedDocUids.value.filter((uid) => !uidSet.has(uid));
  }

  function toggleSelection(docUid: string, checked: boolean) {
    if (checked && !filteredDocUidSet.value.has(docUid)) return;
    selectedDocUids.value = checked
      ? Array.from(new Set([...selectedDocUids.value, docUid]))
      : selectedDocUids.value.filter((selectedUid) => selectedUid !== docUid);
  }

  function toggleAll(checked: boolean) {
    selectedDocUids.value = checked ? filteredDocUids.value : [];
  }

  async function restore(docUid: string) {
    operating.value = true;
    try {
      await restoreDocApi(docUid);
      docStore.invalidateDocListCache();
      removeDocs([docUid]);
      void loadStats();
    } finally {
      operating.value = false;
    }
  }

  async function bulkRestore() {
    if (!selectedDocUids.value.length) return;
    operating.value = true;
    try {
      const response = await bulkRestoreTrashDocsApi(selectedDocUids.value);
      docStore.invalidateDocListCache();
      removeDocs(response.restoredDocUids);
      void loadStats();
    } finally {
      bulkRestoring.value = false;
      operating.value = false;
    }
  }

  async function hardDelete() {
    if (!removing.value) return;
    operating.value = true;
    const docUid = removing.value.docUid;
    try {
      await hardDeleteDocApi(docUid);
      removeDocs([docUid]);
      void loadStats();
    } finally {
      removing.value = null;
      operating.value = false;
    }
  }

  async function bulkHardDelete() {
    if (!selectedDocUids.value.length) return;
    operating.value = true;
    try {
      const response = await bulkHardDeleteTrashDocsApi(selectedDocUids.value);
      removeDocs(response.deletedDocUids);
      void loadStats();
    } finally {
      bulkRemoving.value = false;
      operating.value = false;
    }
  }

  async function loadStats() {
    try {
      trashStats.value = await getTrashStatsApi();
    } catch {
      // 保持默认展示
    }
  }

  onMounted(() => {
    void load();
    void loadStats();
  });

  return {
    docs, loading, operating, removing, bulkRestoring, bulkRemoving,
    selectedDocUids, hasMore, timeFilter, newestFirst, trashStats,
    selectedCount, allSelected, recoverableCount, releaseSize, storagePercent, usedStorageText, filteredDocs,
    loadMore, toggleSelection, toggleAll, restore, bulkRestore, hardDelete, bulkHardDelete,
    getRetentionDaysLeft, getRetentionText, formatDate
  };

  function getRetentionDaysLeft(deletedAt?: string | null): number {
    if (!deletedAt) return trashRetentionDays.value;
    const daysPassed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
    return Math.max(0, Math.ceil(trashRetentionDays.value - daysPassed));
  }

  function getRetentionText(deletedAt?: string | null): string {
    const daysLeft = getRetentionDaysLeft(deletedAt);
    if (daysLeft <= 0) return "即将清除";
    if (daysLeft === 1) return "明天清除";
    return `${daysLeft}天后清除`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}
