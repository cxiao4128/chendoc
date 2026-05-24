<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Check, ExternalLink, RefreshCcw, Search, X } from "lucide-vue-next";
import { listShareReviewsApi, reviewShareApi, type ShareReviewItem } from "../../api/shares";

const shares = ref<ShareReviewItem[]>([]);
const loading = ref(false);
const keyword = ref("");
const statusFilter = ref<"all" | "pending" | "approved" | "rejected">("pending");
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
    if (!q) return true;
    return (
      item.docTitle.toLowerCase().includes(q) ||
      String(item.shareCode).includes(q) ||
      (item.ownerName || "").toLowerCase().includes(q)
    );
  });
});

function statusCount(status: typeof statusOptions[number]["value"]) {
  if (status === "all") return shares.value.length;
  return shares.value.filter((item) => item.reviewStatus === status).length;
}

function statusText(status?: string) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "未通过";
  return "待审核";
}

function statusClass(status?: string) {
  if (status === "approved") return "is-approved";
  if (status === "rejected") return "is-rejected";
  return "is-pending";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
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
  const shareCode = Number(state.shareCode.trim());
  savingId.value = item.id;
  try {
    await reviewShareApi(item.id, {
      action,
      shareCode: Number.isInteger(shareCode) && shareCode > 0 ? shareCode : item.shareCode,
      note: state.note.trim() || null
    });
    await load();
  } finally {
    savingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="share-review-page">
    <header class="share-review-page__head">
      <div>
        <h1>分享审核</h1>
        <p>只审核普通用户文档。管理员自己的文档不会进入这里。</p>
      </div>
      <button class="cd-button" type="button" :disabled="loading" @click="load">
        <RefreshCcw :size="16" />刷新
      </button>
    </header>

    <form class="share-review-page__search" @submit.prevent>
      <Search :size="16" />
      <input v-model.trim="keyword" placeholder="搜索文档、用户或分享数字" />
    </form>

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

    <div v-if="loading" class="share-review-page__loading">
      <span v-for="item in 5" :key="item" class="cd-skeleton" />
    </div>

    <div v-else-if="!filteredShares.length" class="share-review-page__empty">
      <strong>暂无审核项</strong>
      <span>普通用户申请公开分享后，会出现在这里。</span>
    </div>

    <div v-else class="share-review-page__list">
      <article v-for="item in filteredShares" :key="item.id" class="share-review-page__item">
        <div class="share-review-page__main">
          <span class="share-review-page__status" :class="statusClass(item.reviewStatus)">
            {{ statusText(item.reviewStatus) }}
          </span>
          <h2>{{ item.docTitle }}</h2>
          <p>
            <span>用户：{{ item.ownerName || item.ownerId || "未知" }}</span>
            <span>申请：{{ formatDate(item.updatedAt) }}</span>
            <span>访问：{{ item.viewCount }}</span>
          </p>
          <RouterLink class="cd-button" :to="`/admin/docs/${item.docId}`">
            <ExternalLink :size="16" />阅读和编辑文档
          </RouterLink>
        </div>

        <div class="share-review-page__form">
          <label>
            <span>分享数字</span>
            <input v-model.trim="ensureEdit(item).shareCode" inputmode="numeric" :disabled="item.reviewStatus !== 'pending'" />
          </label>
          <label>
            <span>审核备注</span>
            <input v-model.trim="ensureEdit(item).note" placeholder="驳回时建议说明原因" :disabled="item.reviewStatus !== 'pending'" />
          </label>
          <div v-if="item.reviewStatus === 'pending'" class="share-review-page__actions">
            <button class="cd-button primary" type="button" :disabled="savingId === item.id" @click="review(item, 'approve')">
              <Check :size="16" />通过并发布
            </button>
            <button class="cd-button danger" type="button" :disabled="savingId === item.id" @click="review(item, 'reject')">
              <X :size="16" />驳回
            </button>
          </div>
          <p v-else class="share-review-page__locked">
            {{ item.reviewStatus === "approved" ? "文档已通过，不可重复点击审核。" : "文档未通过，用户更新文档内容后才可再次提交。" }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>
