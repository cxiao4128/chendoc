<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import EmptyState from "../../components/common/EmptyState.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useDocStore } from "../../stores/doc";
import "./doc-list.css";

type DocPreview = {
  title: string;
  summary?: string | null;
  excerpt?: string | null;
  snippet?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
};

type DocStoreCompat = {
  listError?: unknown;
};

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const isMobile = useIsMobileViewport();

const query = computed(() => String(route.query.q || "").trim());
const visibleDocs = computed(() => docs.docs);
const searchKeyword = ref(query.value);
const localListError = ref("");
const bulkMode = ref(false);
const selectedDocIds = ref<Set<number>>(new Set());
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);
const listErrorText = computed(() => normalizeError((docs as unknown as DocStoreCompat).listError) || localListError.value);
const selectedCount = computed(() => selectedDocIds.value.size);
const allVisibleSelected = computed(() => !!visibleDocs.value.length && visibleDocs.value.every((doc) => selectedDocIds.value.has(doc.id)));

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(`/admin/docs/${doc.id}`);
}

function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }) {
  if (doc.customSlug) return `/r/${doc.customSlug}`;
  return doc.shareCode ? `/r/${doc.shareCode}` : "未分享";
}

function shareStatusText(doc: { shareCode?: number | null; customSlug?: string | null; shareEnabled?: boolean | null; shareReviewStatus?: string | null }) {
  if (!doc.shareCode) return "未分享";
  if (doc.shareEnabled) return sharePath(doc);
  if (doc.shareReviewStatus === "pending") return `审核中 · ${doc.shareCode}`;
  if (doc.shareReviewStatus === "rejected") return `未通过 · ${doc.shareCode}`;
  return sharePath(doc);
}

function normalizeError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "value" in error) return normalizeError((error as { value: unknown }).value);
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return "文档列表加载失败，请稍后重试。";
}

function normalizePreview(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clampPreview(text: string, keyword: string) {
  const limit = 132;
  if (text.length <= limit) return text;
  if (!keyword) return `${text.slice(0, limit)}…`;
  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return `${text.slice(0, limit)}…`;
  const start = Math.max(0, index - 36);
  const end = Math.min(text.length, index + keyword.length + 84);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function docPreviewText(doc: DocPreview) {
  const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
  const text = normalizePreview(source);
  if (!text) return "";
  return clampPreview(text, query.value);
}

async function load() {
  localListError.value = "";
  try {
    await docs.loadList(query.value);
  } catch (error) {
    localListError.value = normalizeError(error) || "文档列表加载失败，请稍后重试。";
  }
}

function retryLoad() {
  void load();
}

function setSelectedDocIds(nextIds: Iterable<number>) {
  selectedDocIds.value = new Set(nextIds);
}

function enterBulkMode() {
  bulkMode.value = true;
}

function cancelBulkMode() {
  bulkMode.value = false;
  setSelectedDocIds([]);
  bulkDeleteOpen.value = false;
}

function toggleDocSelection(id: number) {
  const next = new Set(selectedDocIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedDocIds.value = next;
}

function toggleAllVisibleDocs() {
  if (allVisibleSelected.value) {
    setSelectedDocIds([]);
    return;
  }
  setSelectedDocIds(visibleDocs.value.map((doc) => doc.id));
}

function openOrToggleDoc(id: number) {
  if (bulkMode.value) {
    toggleDocSelection(id);
    return;
  }
  router.push(`/admin/docs/${id}`);
}

function handleRowKeydown(event: Event, id: number) {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
  keyboardEvent.preventDefault();
  openOrToggleDoc(id);
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
  const ids = Array.from(selectedDocIds.value);
  if (!ids.length) return;
  bulkDeleting.value = true;
  try {
    const deletedIds = await docs.bulkDeleteDocs(ids);
    const deletedIdSet = new Set(deletedIds);
    setSelectedDocIds(ids.filter((id) => !deletedIdSet.has(id)));
    if (!selectedDocIds.value.size) cancelBulkMode();
  } finally {
    bulkDeleting.value = false;
  }
}

function statusText(status: string) {
  return status === "published" ? "已发布" : "草稿";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function submitSearch() {
  const value = searchKeyword.value.trim();
  router.push({ path: "/admin/docs", query: value ? { q: value } : {} });
}

onMounted(load);
watch(() => route.query.q, load);
watch(query, (value) => {
  searchKeyword.value = value;
  cancelBulkMode();
});
watch(visibleDocs, (items) => {
  const visibleIdSet = new Set(items.map((doc) => doc.id));
  setSelectedDocIds(Array.from(selectedDocIds.value).filter((id) => visibleIdSet.has(id)));
});
</script>

<template>
  <section class="doc-list-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <div class="doc-list-page__mobile-hero">
        <span>内容库</span>
        <h1>文档空间</h1>
        <p>在手机上快速搜索、继续编辑和切换最近文档，浏览结构更接近原生内容 app。</p>
      </div>

      <form class="doc-list-page__mobile-search" @submit.prevent="submitSearch">
        <Search :size="17" />
        <input v-model.trim="searchKeyword" aria-label="搜索文档" placeholder="搜索标题或输入分享路径" />
        <button type="submit">搜索</button>
      </form>

      <div class="doc-list-page__mobile-actions">
        <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="onBulkDeleteClick">
          <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量删除" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="toggleAllVisibleDocs">
          {{ allVisibleSelected ? "取消全选" : "全选" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="cancelBulkMode">取消</button>
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        <RouterLink class="cd-button" to="/admin/trash"><Trash2 :size="16" />回收站</RouterLink>
      </div>

      <div v-if="docs.loadingList" class="doc-list-page__skeleton is-mobile">
        <span v-for="i in 5" :key="i" class="cd-skeleton" />
      </div>

      <div v-else-if="listErrorText" class="doc-list-page__error is-mobile">
        <strong>文档列表加载失败</strong>
        <p>{{ listErrorText }}</p>
        <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
      </div>

      <EmptyState v-else-if="!visibleDocs.length" title="没有找到文档" description="可以新建一篇文档，或换个关键词搜索。">
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
      </EmptyState>

      <div v-else class="doc-list-page__mobile-list">
        <article
          v-for="doc in visibleDocs"
          :key="doc.id"
          class="doc-list-page__mobile-card"
          :class="{ 'is-bulk': bulkMode, 'is-selected': selectedDocIds.has(doc.id) }"
          role="button"
          tabindex="0"
          @click="openOrToggleDoc(doc.id)"
          @keydown="handleRowKeydown($event, doc.id)"
        >
          <label v-if="bulkMode" class="doc-list-page__select" @click.stop>
            <input :checked="selectedDocIds.has(doc.id)" type="checkbox" @change="toggleDocSelection(doc.id)" />
            <span></span>
          </label>
          <div class="doc-list-page__mobile-row">
            <strong>{{ doc.title }}</strong>
            <span>{{ statusText(doc.status) }}</span>
          </div>
          <p v-if="query && docPreviewText(doc)" class="doc-list-page__mobile-preview">{{ docPreviewText(doc) }}</p>
          <p>{{ formatDate(doc.updatedAt) }}</p>
          <code>{{ shareStatusText(doc) }}</code>
        </article>
      </div>
    </template>

    <template v-else>
      <div class="doc-list-page__head">
        <div>
          <h1>文档</h1>
          <p v-if="query"><Search :size="14" /> 搜索：{{ query }}</p>
          <p v-else>只返回标题、状态、更新时间和分享状态，正文按需进入文档后加载。</p>
        </div>
        <div class="doc-list-page__actions">
          <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="onBulkDeleteClick">
            <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量删除" }}
          </button>
          <button v-if="bulkMode" class="cd-button" type="button" @click="toggleAllVisibleDocs">
            {{ allVisibleSelected ? "取消全选" : "全选" }}
          </button>
          <button v-if="bulkMode" class="cd-button" type="button" @click="cancelBulkMode">取消</button>
          <RouterLink class="cd-button" to="/admin/trash"><Trash2 :size="16" />回收站</RouterLink>
          <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        </div>
      </div>

      <div v-if="docs.loadingList" class="doc-list-page__skeleton">
        <span v-for="i in 6" :key="i" class="cd-skeleton" />
      </div>

      <div v-else-if="listErrorText" class="doc-list-page__error">
        <strong>文档列表加载失败</strong>
        <p>{{ listErrorText }}</p>
        <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
      </div>

      <EmptyState v-else-if="!visibleDocs.length" title="没有找到文档" description="可以新建一篇文档，或换个关键词搜索。">
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
      </EmptyState>

      <div v-else class="doc-list-page__table">
        <article
          v-for="doc in visibleDocs"
          :key="doc.id"
          class="doc-list-page__row"
          :class="{ 'is-bulk': bulkMode, 'is-selected': selectedDocIds.has(doc.id) }"
          role="button"
          tabindex="0"
          @click="openOrToggleDoc(doc.id)"
          @keydown="handleRowKeydown($event, doc.id)"
        >
          <label v-if="bulkMode" class="doc-list-page__select" @click.stop>
            <input :checked="selectedDocIds.has(doc.id)" type="checkbox" @change="toggleDocSelection(doc.id)" />
            <span></span>
          </label>
          <span class="doc-list-page__row-title">
            <strong>{{ doc.title }}</strong>
            <small v-if="query && docPreviewText(doc)">{{ docPreviewText(doc) }}</small>
          </span>
          <span>{{ statusText(doc.status) }}</span>
          <span>{{ formatDate(doc.updatedAt) }}</span>
          <code>{{ shareStatusText(doc) }}</code>
        </article>
      </div>
    </template>
    <ConfirmDialog
      v-model="bulkDeleteOpen"
      danger
      title="批量删除"
      :message="`确认将选中的 ${selectedCount} 篇文档移入回收站吗？`"
      confirm-text="批量删除"
      @confirm="confirmBulkDelete"
    />
  </section>
</template>
