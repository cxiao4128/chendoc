import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { formsApi, type FormItem } from "@/services/api/forms.api";
import { normalizeError } from "../../../utils/error";
import { publicUrl } from "../../../config/runtime";

export type FormViewFilter = "all" | "published" | "draft" | "closed";
export type FormSortMode = "updatedDesc" | "createdDesc" | "titleAsc";

export function formStatusLabel(status: string) {
  return status === "published" ? "已发布" : status === "draft" ? "草稿" : "已关闭";
}

export function formatFormListDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

export function useFormList() {
  const router = useRouter();
  const activeView = ref<FormViewFilter>("all");
  const allForms = ref<FormItem[]>([]);
  const loading = ref(false);
  const localError = ref("");
  const sortMode = ref<FormSortMode>("updatedDesc");
  const compactMode = ref(false);
  const selectedFormIds = ref<Set<number>>(new Set());
  const bulkMode = ref(false);
  const deleteDialogOpen = ref(false);
  const deletingId = ref<number | null>(null);
  const bulkDeleteOpen = ref(false);
  const bulkDeleting = ref(false);
  const copiedUid = ref<string | null>(null);

  const visibleForms = computed(() => {
    const filtered = activeView.value === "published"
      ? allForms.value.filter((form) => form.status === "published")
      : activeView.value === "draft"
        ? allForms.value.filter((form) => form.status === "draft")
        : activeView.value === "closed"
          ? allForms.value.filter((form) => form.status === "closed")
          : allForms.value;
    return [...filtered].sort((left, right) => {
      if (sortMode.value === "titleAsc") return left.title.localeCompare(right.title, "zh-CN");
      if (sortMode.value === "createdDesc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  });

  const totalCount = computed(() => allForms.value.length);
  const publishedCount = computed(() => allForms.value.filter((form) => form.status === "published").length);
  const draftCount = computed(() => allForms.value.filter((form) => form.status === "draft").length);
  const closedCount = computed(() => allForms.value.filter((form) => form.status === "closed").length);
  const selectedCount = computed(() => selectedFormIds.value.size);
  const errorText = computed(() => normalizeError(localError.value) || "");
  const sortLabel = computed(() => {
    if (sortMode.value === "createdDesc") return "按创建时间";
    if (sortMode.value === "titleAsc") return "按标题";
    return "按更新时间";
  });

  function cycleSortMode() {
    sortMode.value = sortMode.value === "updatedDesc" ? "createdDesc" : sortMode.value === "createdDesc" ? "titleAsc" : "updatedDesc";
  }

  async function loadForms() {
    loading.value = true;
    localError.value = "";
    try {
      const response = await formsApi.list();
      allForms.value = response.forms;
    } catch (error) {
      localError.value = normalizeError(error) || "收集表加载失败，请稍后重试。";
    } finally {
      loading.value = false;
    }
  }

  function retryLoad() {
    void loadForms();
  }

  function createForm() {
    router.push("/admin/forms/new");
  }

  function editForm(id: number) {
    router.push(`/admin/forms/${id}`);
  }

  function viewSubmissions(id: number) {
    router.push(`/admin/forms/${id}/submissions`);
  }

  async function copyLink(form: FormItem) {
    if (form.status !== "published") return;
    const formUid = form.formUid;
    const url = publicUrl(`/f/${formUid}`);
    try {
      await navigator.clipboard.writeText(url);
      copiedUid.value = formUid;
      setTimeout(() => {
        if (copiedUid.value === formUid) copiedUid.value = null;
      }, 2000);
    } catch {
      localError.value = "复制失败，请检查浏览器剪贴板权限。";
    }
  }

  function openOrToggleForm(id: number) {
    if (bulkMode.value) {
      toggleFormSelection(id);
      return;
    }
    editForm(id);
  }

  function toggleFormSelection(id: number) {
    const next = new Set(selectedFormIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedFormIds.value = next;
  }

  function toggleAllVisibleForms() {
    if (selectedCount.value === visibleForms.value.length) {
      selectedFormIds.value = new Set();
      return;
    }
    selectedFormIds.value = new Set(visibleForms.value.map((form) => form.id));
  }

  function enterBulkMode() {
    bulkMode.value = true;
  }

  function cancelBulkMode() {
    bulkMode.value = false;
    selectedFormIds.value = new Set();
    bulkDeleteOpen.value = false;
  }

  async function doDeleteForm() {
    if (!deletingId.value) return;
    try {
      await formsApi.delete(deletingId.value);
      allForms.value = allForms.value.filter((form) => form.id !== deletingId.value);
    } catch (error) {
      localError.value = error instanceof Error ? error.message : "删除失败";
    } finally {
      deleteDialogOpen.value = false;
      deletingId.value = null;
    }
  }

  function onBulkDeleteClick() {
    if (!bulkMode.value) {
      enterBulkMode();
      return;
    }
    if (!selectedCount.value) return;
    bulkDeleteOpen.value = true;
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedFormIds.value);
    if (!ids.length) return;
    bulkDeleting.value = true;
    try {
      for (const id of ids) {
        await formsApi.delete(id);
      }
      allForms.value = allForms.value.filter((form) => !selectedFormIds.value.has(form.id));
      selectedFormIds.value = new Set();
      cancelBulkMode();
    } catch (error) {
      localError.value = error instanceof Error ? error.message : "批量删除失败";
    } finally {
      bulkDeleting.value = false;
    }
  }

  function resetFilters() {
    activeView.value = "all";
    sortMode.value = "updatedDesc";
  }

  onMounted(() => {
    void loadForms();
  });

  return {
    activeView,
    visibleForms,
    loading,
    sortMode,
    compactMode,
    selectedFormIds,
    bulkMode,
    deleteDialogOpen,
    bulkDeleteOpen,
    bulkDeleting,
    copiedUid,
    totalCount,
    publishedCount,
    draftCount,
    closedCount,
    selectedCount,
    errorText,
    sortLabel,
    cycleSortMode,
    retryLoad,
    createForm,
    editForm,
    viewSubmissions,
    copyLink,
    openOrToggleForm,
    toggleFormSelection,
    toggleAllVisibleForms,
    cancelBulkMode,
    doDeleteForm,
    onBulkDeleteClick,
    confirmBulkDelete,
    resetFilters
  };
}
