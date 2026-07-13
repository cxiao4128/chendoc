import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { commentsApi, type Comment } from "../../../services/api/comments.api";
import { nativeConfirm } from "../../../services/nativeDialog";

export type CommentFilterStatus = "active" | "hidden" | "deleted" | "";

export function formatCommentDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function commentStatusTag(status: string) {
  switch (status) {
    case "active":
      return { label: "正常", class: "cd-tag--success" };
    case "hidden":
      return { label: "隐藏", class: "cd-tag--warning" };
    case "deleted":
      return { label: "已删", class: "cd-tag--danger" };
    default:
      return { label: status, class: "" };
  }
}

export function truncateCommentContent(content: string, maxLength = 100) {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

export function useCommentModeration() {
  const router = useRouter();
  const comments = ref<Comment[]>([]);
  const loading = ref(false);
  const error = ref("");
  const selectedIds = ref<Set<number>>(new Set());
  const currentPage = ref(1);
  const pageSize = ref(20);
  const totalPages = ref(1);
  const total = ref(0);
  const filterDocUid = ref("");
  const filterStatus = ref<CommentFilterStatus>("");
  const filterKeyword = ref("");
  const showFilterPanel = ref(false);

  const pageNumbers = computed(() => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage.value - 2);
    const end = Math.min(totalPages.value, currentPage.value + 2);
    for (let page = start; page <= end; page++) pages.push(page);
    return pages;
  });

  const hasActiveFilters = computed(() => Boolean(filterDocUid.value || filterStatus.value || filterKeyword.value));

  async function loadComments() {
    loading.value = true;
    error.value = "";
    try {
      const result = await commentsApi.listAdmin({
        page: currentPage.value,
        pageSize: pageSize.value,
        docUid: filterDocUid.value || undefined,
        status: filterStatus.value || undefined,
        keyword: filterKeyword.value || undefined
      });
      comments.value = result.comments;
      total.value = result.total;
      totalPages.value = result.totalPages;
      selectedIds.value = new Set();
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : "加载评论失败";
    } finally {
      loading.value = false;
    }
  }

  function handleSearch() {
    currentPage.value = 1;
    void loadComments();
  }

  function resetFilters() {
    filterDocUid.value = "";
    filterStatus.value = "";
    filterKeyword.value = "";
    currentPage.value = 1;
    void loadComments();
  }

  function toggleSelectAll() {
    if (selectedIds.value.size === comments.value.length) {
      selectedIds.value = new Set();
      return;
    }
    selectedIds.value = new Set(comments.value.map((comment) => comment.id));
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  async function handleDelete(comment: Comment) {
    const confirmed = await nativeConfirm({
      title: "删除评论",
      message: `确定删除此评论？\n\n"${comment.content.slice(0, 50)}..."`,
      confirmText: "删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await commentsApi.deleteAdmin(comment.id);
      void loadComments();
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : "删除失败";
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedIds.value);
    if (ids.length === 0) return;
    const confirmed = await nativeConfirm({
      title: "批量删除评论",
      message: `确定删除选中的 ${ids.length} 条评论？`,
      confirmText: "批量删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await commentsApi.deleteBatchAdmin(ids);
      selectedIds.value = new Set();
      void loadComments();
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : "批量删除失败";
    }
  }

  function goToDoc(docUid: string) {
    router.push(`/admin/docs/${docUid}`);
  }

  function goToPage(page: number) {
    currentPage.value = page;
    void loadComments();
  }

  function goPreviousPage() {
    if (currentPage.value <= 1) return;
    goToPage(currentPage.value - 1);
  }

  function goNextPage() {
    if (currentPage.value >= totalPages.value) return;
    goToPage(currentPage.value + 1);
  }

  onMounted(() => {
    void loadComments();
  });

  return {
    comments,
    loading,
    error,
    selectedIds,
    currentPage,
    totalPages,
    total,
    filterDocUid,
    filterStatus,
    filterKeyword,
    showFilterPanel,
    pageNumbers,
    hasActiveFilters,
    loadComments,
    handleSearch,
    resetFilters,
    toggleSelectAll,
    toggleSelect,
    handleDelete,
    handleBatchDelete,
    goToDoc,
    goToPage,
    goPreviousPage,
    goNextPage
  };
}
