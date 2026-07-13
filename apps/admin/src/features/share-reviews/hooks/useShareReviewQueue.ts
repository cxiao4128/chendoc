/**
 * features/share-reviews/hooks/useShareReviewQueue.ts
 * 分享审核队列 hooks
 */
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { ShareReviewItem } from "@/services/api/share.api";
import { listShareReviewsApi, reviewShareApi } from "@/services/api/share.api";
import { publicUrl } from "@/config/runtime";

export type { ShareReviewItem };

export function useShareReviewQueue() {
  const router = useRouter();
  const shares = ref<ShareReviewItem[]>([]);
  const loading = ref(false);
  const keyword = ref("");
  const statusFilter = ref<"all" | "pending" | "approved" | "rejected">("pending");
  const scopeFilter = ref<"all" | "public" | "protected">("all");
  const dateFilter = ref<"all" | "today" | "week">("all");
  const sortMode = ref<"updatedDesc" | "createdDesc" | "titleAsc">("updatedDesc");
  const savingId = ref<number | null>(null);
  const editState = reactive<Record<number, { shareCode: string; note: string }>>({});

  const filteredShares = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    return shares.value.filter((item: ShareReviewItem) => {
      if (statusFilter.value !== "all" && item.reviewStatus !== statusFilter.value) return false;
      if (scopeFilter.value === "protected" && !item.hasPassword) return false;
      if (scopeFilter.value === "public" && item.hasPassword) return false;
      if (dateFilter.value === "today" && !isToday(item.createdAt || item.updatedAt)) return false;
      if (dateFilter.value === "week" && !isRecentDays(item.createdAt || item.updatedAt, 7)) return false;
      if (!q) return true;
      return (
        item.docTitle.toLowerCase().includes(q) ||
        String(item.shareCode).includes(q) ||
        (item.ownerName || "").toLowerCase().includes(q)
      );
    }).sort((left: ShareReviewItem, right: ShareReviewItem) => {
      if (sortMode.value === "titleAsc") return left.docTitle.localeCompare(right.docTitle, "zh-CN");
      if (sortMode.value === "createdDesc") return new Date(right.createdAt || right.updatedAt || 0).getTime() - new Date(left.createdAt || left.updatedAt || 0).getTime();
      return new Date(right.updatedAt || left.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
    });
  });

  const todayApplications = computed(() => shares.value.filter((item: ShareReviewItem) => isToday(item.createdAt || item.updatedAt)).length);
  const recentReviews = computed(() => shares.value.filter((item: ShareReviewItem) => item.reviewStatus !== "pending").slice(0, 4));

  function statusCount(status: "all" | "pending" | "approved" | "rejected") {
    if (status === "all") return shares.value.length;
    return shares.value.filter((item: ShareReviewItem) => item.reviewStatus === status).length;
  }

  function isToday(value?: string | null) {
    if (!value) return false;
    const date = new Date(value);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function isRecentDays(value: string | null | undefined, days: number) {
    if (!value) return false;
    return Date.now() - new Date(value).getTime() <= days * 24 * 60 * 60 * 1000;
  }

  function statusText(status?: string) {
    if (status === "approved") return "已通过";
    if (status === "rejected") return "未通过";
    return "待审核";
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

  function statusClass(item: ShareReviewItem) {
    if (item.reviewStatus === "approved") return "is-approved";
    if (item.reviewStatus === "rejected") return "is-rejected";
    return "is-pending";
  }

  function ensureEdit(item: ShareReviewItem) {
    if (!editState[item.id]) {
      editState[item.id] = {
        shareCode: String(item.shareCode),
        note: item.reviewNote || ""
      };
    }
    return editState[item.id];
  }

  async function load() {
    loading.value = true;
    try {
      const response = await listShareReviewsApi();
      shares.value = response.shares;
      for (const item of shares.value) ensureEdit(item);
    } finally {
      loading.value = false;
    }
  }

  async function review(item: ShareReviewItem, action: "approve" | "reject") {
    if (item.reviewStatus !== "pending") return;
    const state = ensureEdit(item);
    savingId.value = item.id;
    try {
      await reviewShareApi(item.id, {
        action,
        note: state.note.trim() || null
      });
      await load();
    } finally {
      savingId.value = null;
    }
  }

  function resetFilters() {
    statusFilter.value = "all";
    scopeFilter.value = "all";
    dateFilter.value = "all";
    sortMode.value = "updatedDesc";
    keyword.value = "";
  }

  function openMore(item: ShareReviewItem) {
    if (item.reviewStatus === "approved" && item.shareCode) {
      window.open(publicUrl(`/r/${item.shareCode}`), "_blank", "noopener,noreferrer");
      return;
    }
    router.push(`/admin/docs/${item.docUid}`);
  }

  onMounted(load);

  return {
    shares,
    loading,
    keyword,
    statusFilter,
    scopeFilter,
    dateFilter,
    sortMode,
    savingId,
    filteredShares,
    todayApplications,
    recentReviews,
    statusCount,
    isToday,
    isRecentDays,
    statusText,
    formatDate,
    statusClass,
    ensureEdit,
    load,
    review,
    resetFilters,
    openMore
  };
}

export function useShareReviewAction() {
  const savingId = ref<number | null>(null);

  async function reviewAction(item: ShareReviewItem, action: "approve" | "reject", note?: string) {
    if (item.reviewStatus !== "pending") return;
    savingId.value = item.id;
    try {
      await reviewShareApi(item.id, { action, note: note || null });
    } finally {
      savingId.value = null;
    }
  }

  return { review: reviewAction, savingId };
}
