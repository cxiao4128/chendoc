import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../../stores/auth";
import { useIsMobileViewport } from "../../../composables/useViewport";
import { useUpload } from "../../../composables/useUpload";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import { bundledLogoUrl as logoUrl } from "../../../config/site-assets";
import { useDocumentActions } from "./useDocumentActions";
import { useDocumentFilters } from "./useDocumentFilters";
import { useDocumentList } from "./useDocumentList";
import { useDocumentStats } from "./useDocumentStats";

export function useDocListPage() {
  const filters = useDocumentFilters();
  const list = useDocumentList();
  const stats = useDocumentStats();
  const actions = useDocumentActions();

  const router = useRouter();
  const auth = useAuthStore();
  const isMobile = useIsMobileViewport();
  const { docsPath, trashPath, docPath } = useWorkspaceRoutes();
  const uploader = useUpload();
  const toolboxCollapsed = ref(false);

  const visibleDocs = computed(() => {
    return list.getVisibleDocs(list.allDocs.value, {
      viewFilter: filters.viewFilter.value,
      spaceFilter: filters.spaceFilter.value,
      tagFilter: filters.tagFilter.value,
      updatedFilter: filters.updatedFilter.value,
      sortMode: filters.sortMode.value,
    });
  });

  const docStats = computed(() => stats.computeStats(list.allDocs.value));
  const totalCount = computed(() => docStats.value.total);
  const publishedCount = computed(() => docStats.value.published);
  const sharedCount = computed(() => docStats.value.shared);
  const reviewCount = computed(() => docStats.value.review);
  const draftCount = computed(() => docStats.value.draft);
  const unsharedCount = computed(() => docStats.value.unshared);
  const availableTags = computed(() => docStats.value.availableTags);
  const allVisibleSelected = computed(() => !!visibleDocs.value.length && visibleDocs.value.every((doc) => actions.selectedDocUids.value.has(doc.docUid)));
  const storageTotalBytes = computed(() => stats.storageOverview.value.totalBytes);
  const storageFileCount = computed(() => stats.storageOverview.value.fileCount);

  async function createNewDoc() {
    const doc = await list.createDoc("未命名文档");
    router.push(docPath(doc.docUid));
  }

  async function createNewTemplateDoc() {
    const doc = await list.createDoc("新建模板文档");
    await list.saveDoc(doc.docUid, {
      contentHtml: "<h2>模板标题</h2><p>在这里写正文。可改成常用方案、说明书、周报或知识卡片。</p>",
      summary: "模板中心创建"
    });
    router.push(docPath(doc.docUid));
  }

  async function handleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    actions.uploading.value = true;
    actions.actionMessage.value = "";
    let createdDocUid = "";
    try {
      const doc = await list.createDoc(file.name.replace(/\.[^.]+$/, "") || "导入文档");
      createdDocUid = doc.docUid;
      const url = await uploader.uploadFile(file, doc.docUid);
      await list.saveDoc(doc.docUid, {
        summary: `上传文件：${file.name}`,
        contentHtml: `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a></p>`
      });
      await stats.loadSystemStatus();
      router.push(docPath(doc.docUid));
    } catch (error) {
      if (createdDocUid) {
        try { await list.bulkDeleteDocs([createdDocUid]); } catch { /* keep original upload error */ }
      }
      actions.actionMessage.value = error instanceof Error ? error.message : "上传失败";
    } finally {
      actions.uploading.value = false;
    }
  }

  function openKanbanDoc(docUid: string) {
    router.push(docPath(docUid));
  }

  async function doBulkDelete() {
    const success = await actions.confirmBulkDelete();
    if (success) {
      await list.load();
    }
  }

  function toggleToolbox() {
    toolboxCollapsed.value = !toolboxCollapsed.value;
    localStorage.setItem("chendoc_docs_toolbox_collapsed", toolboxCollapsed.value ? "1" : "0");
  }

  onMounted(() => {
    toolboxCollapsed.value = localStorage.getItem("chendoc_docs_toolbox_collapsed") === "1";
    filters.initFilters();
    void list.load();
    void stats.loadSystemStatus();
  });

  onUnmounted(() => {
    filters.clearSearchTimer();
  });

  watch(visibleDocs, (items) => {
    const visibleUidSet = new Set(items.map((doc) => doc.docUid));
    actions.setSelectedDocUids(Array.from(actions.selectedDocUids.value).filter((uid) => visibleUidSet.has(uid)));
  });

  return reactive({
    ...filters,
    ...list,
    ...stats,
    ...actions,
    router,
    auth,
    isMobile,
    docsPath,
    trashPath,
    docPath,
    logoUrl,
    toolboxCollapsed,
    visibleDocs,
    totalCount,
    publishedCount,
    sharedCount,
    reviewCount,
    draftCount,
    unsharedCount,
    availableTags,
    allVisibleSelected,
    storageTotalBytes,
    storageFileCount,
    createNewDoc,
    createNewTemplateDoc,
    handleUpload,
    openKanbanDoc,
    doBulkDelete,
    toggleToolbox,
  });
}

export type DocListPageContext = ReturnType<typeof useDocListPage>;
