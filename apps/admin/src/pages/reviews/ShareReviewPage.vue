<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Check, ClipboardCheck, ExternalLink, MoreHorizontal, RefreshCcw, Search, Send, ShieldCheck, X, XCircle } from "lucide-vue-next";
import { listShareReviewsApi, reviewShareApi, type ShareReviewItem } from "../../api/shares";

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

const statusOptions = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "通过文档" },
  { value: "rejected", label: "未通过" },
  { value: "all", label: "全部" }
] as const;

const filteredShares = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return shares.value.filter((item) => {
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
  }).sort((left, right) => {
    if (sortMode.value === "titleAsc") return left.docTitle.localeCompare(right.docTitle, "zh-CN");
    if (sortMode.value === "createdDesc") return new Date(right.createdAt || right.updatedAt || 0).getTime() - new Date(left.createdAt || left.updatedAt || 0).getTime();
    return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
  });
});

const todayApplications = computed(() => shares.value.filter((item) => isToday(item.createdAt || item.updatedAt)).length);
const recentReviews = computed(() => shares.value.filter((item) => item.reviewStatus !== "pending").slice(0, 4));

function statusCount(status: typeof statusOptions[number]["value"]) {
  if (status === "all") return shares.value.length;
  return shares.value.filter((item) => item.reviewStatus === status).length;
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
    window.open(`/r/${item.shareCode}`, "_blank", "noopener,noreferrer");
    return;
  }
  router.push(`/admin/docs/${item.docUid}`);
}

onMounted(load);
</script>

<template>
  <section class="share-review-page">
    <header class="share-review-page__head">
      <div>
        <h1>分享审核</h1>
        <p>审核普通用户提交的公开分享，确认内容和访问范围后再发布。</p>
      </div>
      <button class="cd-button" type="button" :disabled="loading" @click="load">
        <RefreshCcw :size="16" />刷新
      </button>
    </header>

    <div class="share-review-page__stats">
      <article><span><ClipboardCheck :size="28" /></span><b>待审核</b><strong>{{ statusCount("pending") }}</strong><small>来自真实分享申请</small></article>
      <article><span><Send :size="28" /></span><b>今日申请</b><strong>{{ todayApplications }}</strong><small>按 createdAt 统计</small></article>
      <article><span class="is-green"><ShieldCheck :size="28" /></span><b>已通过</b><strong>{{ statusCount("approved") }}</strong><small>当前审核结果</small></article>
      <article><span class="is-red"><XCircle :size="28" /></span><b>已驳回</b><strong>{{ statusCount("rejected") }}</strong><small>当前审核结果</small></article>
    </div>

    <div class="share-review-page__filters" role="tablist" aria-label="审核状态">
      <button
        v-for="option in statusOptions"
        :key="option.value"
        type="button"
        :class="{ 'is-active': statusFilter === option.value }"
        @click="statusFilter = option.value"
      >
        {{ option.label }}
        <span>{{ statusCount(option.value) }}</span>
      </button>
    </div>

    <div class="share-review-page__layout">
      <main class="share-review-page__main-panel">
        <form class="share-review-page__search" @submit.prevent>
          <label>分享范围<select v-model="scopeFilter"><option value="all">全部范围</option><option value="public">公开分享</option><option value="protected">密码保护</option></select></label>
          <label>提交时间<select v-model="dateFilter"><option value="all">全部时间</option><option value="today">今天</option><option value="week">7 天内</option></select></label>
          <label>排序<select v-model="sortMode"><option value="updatedDesc">更新时间（最新）</option><option value="createdDesc">提交时间（最新）</option><option value="titleAsc">文档标题</option></select></label>
          <button class="cd-button" type="button" @click="resetFilters"><Search :size="16" />重置</button>
          <input v-model.trim="keyword" aria-label="搜索文档、用户或分享数字" placeholder="搜索文档、用户或分享数字" />
        </form>

        <div v-if="loading" class="share-review-page__loading">
          <span v-for="item in 5" :key="item" class="cd-skeleton" />
        </div>

        <div v-else-if="!filteredShares.length" class="share-review-page__empty">
          <strong>暂无审核项</strong>
          <span>普通用户申请公开分享后，会出现在这里。</span>
        </div>

        <div v-else class="share-review-page__table">
          <div class="share-review-page__table-head">
            <span>文档名称</span><span>申请人</span><span>分享编号</span><span>提交时间</span><span>分享范围</span><span>审核状态</span><span>备注</span><span>操作</span>
          </div>
          <article v-for="item in filteredShares" :key="item.id">
            <strong>{{ item.docTitle }}</strong>
            <span>{{ item.ownerName || item.ownerId || "未知" }}</span>
            <span>{{ item.shareCode }}</span>
            <span>{{ formatDate(item.updatedAt) }}</span>
            <span class="is-scope">{{ item.hasPassword ? "密码保护" : "公开分享" }}</span>
            <span class="share-review-page__status" :class="statusClass(item)">{{ statusText(item.reviewStatus) }}</span>
            <span>{{ item.reviewNote || "待审核说明" }}</span>
            <div class="share-review-page__actions">
              <RouterLink class="cd-button" :to="`/admin/docs/${item.docUid}`"><ExternalLink :size="14" />查看文档</RouterLink>
              <button v-if="item.reviewStatus === 'pending'" class="cd-button" type="button" :disabled="savingId === item.id" @click="review(item, 'approve')"><Check :size="14" />通过</button>
              <button v-if="item.reviewStatus === 'pending'" class="cd-button" type="button" :disabled="savingId === item.id" @click="review(item, 'reject')"><X :size="14" />驳回</button>
              <button type="button" aria-label="更多" @click="openMore(item)"><MoreHorizontal :size="16" /></button>
            </div>
          </article>
        </div>
      </main>

      <aside class="share-review-page__aside">
        <section><strong>审核边界</strong><p>系统只提供人工审核，不自动判断内容合规。</p><p>审核前检查正文、附件和访问密码。</p><p>内容变更后会自动撤销已通过状态。</p></section>
        <section><strong>最近审核动态 <button type="button" @click="statusFilter = 'all'">查看全部</button></strong><p v-for="item in recentReviews" :key="item.id">{{ statusText(item.reviewStatus) }}：{{ item.docTitle }}</p><p v-if="!recentReviews.length">暂无审核动态</p></section>
        <section><strong>审核统计</strong><div class="share-review-page__donut"><span>总计<br />{{ shares.length }}</span></div></section>
      </aside>
    </div>
  </section>
</template>
