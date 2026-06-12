<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderPlus,
  Grid3X3,
  Import,
  ListFilter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  UploadCloud
} from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import EmptyState from "../../components/common/EmptyState.vue";
import { createShareApi } from "../../api/shares";
import { createSpaceApi } from "../../api/spaces";
import { getSystemStatusApi, type SystemStatusView } from "../../api/settings";
import { useAuth } from "../../composables/useAuth";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useUpload } from "../../composables/useUpload";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { nativePrompt } from "../../services/nativeDialog";
import { useDocStore } from "../../stores/doc";
import logoUrl from "../../assets/chendoc-logo.png";
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

type DocViewFilter = "all" | "published" | "draft" | "review" | "shared" | "unshared";
type SortMode = "updatedDesc" | "createdDesc" | "titleAsc";

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const uploader = useUpload();
const { auth } = useAuth();
const isMobile = useIsMobileViewport();
const { docsPath, trashPath, docPath } = useWorkspaceRoutes();

const query = computed(() => String(route.query.q || "").trim());
const activeView = ref<DocViewFilter>("all");
const allDocs = computed(() => docs.docs);
const visibleDocs = computed(() => {
  const filtered = activeView.value === "published"
    ? allDocs.value.filter((doc) => doc.status === "published")
    : activeView.value === "shared"
      ? allDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled)
      : activeView.value === "review"
        ? allDocs.value.filter((doc) => doc.shareReviewStatus === "pending")
        : activeView.value === "draft"
          ? allDocs.value.filter((doc) => doc.status !== "published")
          : activeView.value === "unshared"
            ? allDocs.value.filter((doc) => !doc.shareCode || !doc.shareEnabled)
            : allDocs.value;
  return [...filtered].sort((left, right) => {
    if (sortMode.value === "titleAsc") return left.title.localeCompare(right.title, "zh-CN");
    if (sortMode.value === "createdDesc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
});
const searchKeyword = ref(query.value);
const localListError = ref("");
const bulkMode = ref(false);
const selectedDocIds = ref<Set<number>>(new Set());
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);
const sortMode = ref<SortMode>("updatedDesc");
const compactMode = ref(false);
const actionMessage = ref("");
const uploading = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);
const systemStatus = ref<SystemStatusView | null>(null);
let searchTimer: ReturnType<typeof window.setTimeout> | null = null;
const listErrorText = computed(() => normalizeError((docs as unknown as DocStoreCompat).listError) || localListError.value);
const selectedCount = computed(() => selectedDocIds.value.size);
const allVisibleSelected = computed(() => !!visibleDocs.value.length && visibleDocs.value.every((doc) => selectedDocIds.value.has(doc.id)));
const totalCount = computed(() => allDocs.value.length);
const publishedCount = computed(() => allDocs.value.filter((doc) => doc.status === "published").length);
const sharedCount = computed(() => allDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled).length);
const reviewCount = computed(() => allDocs.value.filter((doc) => doc.shareReviewStatus === "pending").length);
const draftCount = computed(() => allDocs.value.filter((doc) => doc.status !== "published").length);
const unsharedCount = computed(() => allDocs.value.filter((doc) => !doc.shareCode || !doc.shareEnabled).length);
const ownerName = computed(() => auth.user?.username || "xchen");
const recentDocs = computed(() => visibleDocs.value.slice(0, 5));
const storageTotalBytes = computed(() => systemStatus.value?.storage.totalBytes || 0);
const storageFileCount = computed(() => systemStatus.value?.storage.fileCount || 0);
const storagePercent = computed(() => Math.min(100, Math.round((storageFileCount.value / Math.max(storageFileCount.value, 1)) * 100)));
const sortLabel = computed(() => {
  if (sortMode.value === "createdDesc") return "按创建时间";
  if (sortMode.value === "titleAsc") return "按标题";
  return "按更新时间";
});

function cycleSortMode() {
  sortMode.value = sortMode.value === "updatedDesc" ? "createdDesc" : sortMode.value === "createdDesc" ? "titleAsc" : "updatedDesc";
}

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(docPath(doc.id));
}

async function createTemplateDoc() {
  const doc = await docs.createDoc("新建模板文档");
  await docs.saveDoc(doc.id, {
    contentHtml: "<h2>模板标题</h2><p>在这里写正文。可改成常用方案、说明书、周报或知识卡片。</p>",
    summary: "模板中心创建"
  });
  router.push(docPath(doc.id));
}

async function createFolder() {
  const name = await nativePrompt({
    title: "新建空间",
    label: "空间名称",
    value: "新建空间",
    confirmText: "创建空间",
    required: true
  });
  if (!name?.trim()) return;
  const result = await createSpaceApi({ name: name.trim(), description: "从文档工作台创建" });
  actionMessage.value = `空间已创建：${name.trim()} #${result.id}`;
}

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function triggerUpload() {
  uploadInput.value?.click();
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  actionMessage.value = "";
  try {
    const url = await uploader.uploadFile(file);
    const doc = await docs.createDoc(file.name.replace(/\.[^.]+$/, "") || "导入文档");
    await docs.saveDoc(doc.id, {
      summary: `上传文件：${file.name}`,
      contentHtml: `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a></p>`
    });
    await loadSystemStatus();
    router.push(docPath(doc.id));
  } finally {
    uploading.value = false;
  }
}

async function togglePinned(doc: { id: number; pinned?: boolean }) {
  await docs.saveDoc(doc.id, { pinned: !doc.pinned });
  await load();
}

async function openShare(doc: { id: number; shareCode?: number | null; customSlug?: string | null }) {
  if (!doc.shareCode) {
    await createShareApi(doc.id);
    await load();
    return;
  }
  window.open(sharePath(doc), "_blank", "noopener,noreferrer");
}

function resetFilters() {
  activeView.value = "all";
  sortMode.value = "updatedDesc";
  searchKeyword.value = "";
  router.replace({ path: docsPath.value });
}

async function loadSystemStatus() {
  try {
    systemStatus.value = (await getSystemStatusApi()).status;
  } catch {
    systemStatus.value = null;
  }
}

function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }) {
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
  router.push(docPath(id));
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
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function submitSearch() {
  const value = searchKeyword.value.trim();
  router.push({ path: docsPath.value, query: value ? { q: value } : {} });
}

function queueSearch(value: string) {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    const normalized = value.trim();
    if (normalized === query.value) return;
    router.replace({ path: docsPath.value, query: normalized ? { q: normalized } : {} });
  }, 280);
}

function loadMore() {
  void docs.loadMore(query.value);
}

onMounted(() => {
  void load();
  void loadSystemStatus();
});
onUnmounted(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
});
watch(() => route.query.q, load);
watch(query, (value) => {
  searchKeyword.value = value;
  cancelBulkMode();
});
watch(searchKeyword, queueSearch);
watch(visibleDocs, (items) => {
  const visibleIdSet = new Set(items.map((doc) => doc.id));
  setSelectedDocIds(Array.from(selectedDocIds.value).filter((id) => visibleIdSet.has(id)));
});
</script>

<template>
  <section class="doc-list-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <form class="doc-list-page__mobile-search" @submit.prevent="submitSearch">
        <Search :size="17" />
        <input v-model.trim="searchKeyword" aria-label="搜索文档" placeholder="搜索标题或输入分享路径" />
        <button type="submit">搜索</button>
      </form>

      <div class="doc-list-page__mobile-tabs" role="tablist" aria-label="移动端文档视图">
        <button type="button" :class="{ 'is-active': activeView === 'all' }" role="tab" :aria-selected="activeView === 'all'" @click="activeView = 'all'">最近</button>
        <button type="button" :class="{ 'is-active': activeView === 'published' }" role="tab" :aria-selected="activeView === 'published'" @click="activeView = 'published'">已发布</button>
        <button type="button" :class="{ 'is-active': activeView === 'shared' }" role="tab" :aria-selected="activeView === 'shared'" @click="activeView = 'shared'">已分享</button>
        <button type="button" :class="{ 'is-active': activeView === 'draft' }" role="tab" :aria-selected="activeView === 'draft'" @click="activeView = 'draft'">草稿</button>
        <button type="button" @click="resetFilters">筛选</button>
      </div>

      <div class="doc-list-page__mobile-actions">
        <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="onBulkDeleteClick">
          <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量删除" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="toggleAllVisibleDocs">
          {{ allVisibleSelected ? "取消全选" : "全选" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="cancelBulkMode">取消</button>
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        <RouterLink class="cd-button" :to="trashPath"><Trash2 :size="16" />回收站</RouterLink>
      </div>

      <div v-if="docs.loadingList" class="doc-list-page__skeleton is-mobile">
        <span v-for="i in 5" :key="i" class="cd-skeleton" />
      </div>

      <div v-else-if="listErrorText" class="doc-list-page__error is-mobile">
        <strong>文档列表加载失败</strong>
        <p>{{ listErrorText }}</p>
        <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
      </div>

      <EmptyState v-else-if="!visibleDocs.length" title="没有文档">
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
            <i><FileText :size="18" /></i>
            <div>
              <strong>{{ doc.title }}</strong>
              <p v-if="query && docPreviewText(doc)" class="doc-list-page__mobile-preview">{{ docPreviewText(doc) }}</p>
              <p>{{ formatDate(doc.updatedAt) }}</p>
              <code>{{ shareStatusText(doc) }}</code>
            </div>
            <span>{{ statusText(doc.status) }}</span>
          </div>
        </article>
      </div>
      <button v-if="docs.listHasMore" class="cd-button doc-list-page__more" type="button" :disabled="docs.loadingList" @click="loadMore">
        {{ docs.loadingList ? "加载中..." : "加载更多" }}
      </button>
    </template>

    <template v-else>
      <div class="doc-list-page__head">
        <div>
          <h1>文档 <span aria-hidden="true">✦</span></h1>
          <p>{{ query ? `搜索：${query}` : "集中管理和知识沉淀，安全协作，高效流转" }}</p>
        </div>
        <div class="doc-list-page__actions">
          <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="onBulkDeleteClick">
            <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量操作" }}
          </button>
          <button v-if="bulkMode" class="cd-button" type="button" @click="toggleAllVisibleDocs">
            {{ allVisibleSelected ? "取消全选" : "全选" }}
          </button>
          <button v-if="bulkMode" class="cd-button" type="button" @click="cancelBulkMode">取消</button>
          <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        </div>
      </div>

      <div class="doc-list-page__filter-tabs" role="tablist" aria-label="文档视图">
        <button type="button" :class="{ 'is-active': activeView === 'all' }" role="tab" :aria-selected="activeView === 'all'" @click="activeView = 'all'">全部 <span>{{ totalCount }}</span></button>
        <button type="button" :class="{ 'is-active': activeView === 'published' }" role="tab" :aria-selected="activeView === 'published'" @click="activeView = 'published'">已发布 <span>{{ publishedCount }}</span></button>
        <button type="button" :class="{ 'is-active': activeView === 'draft' }" role="tab" :aria-selected="activeView === 'draft'" @click="activeView = 'draft'">草稿 <span>{{ draftCount }}</span></button>
        <button type="button" :class="{ 'is-active': activeView === 'review' }" role="tab" :aria-selected="activeView === 'review'" @click="activeView = 'review'">审批中 <span>{{ reviewCount }}</span></button>
        <button type="button" :class="{ 'is-active': activeView === 'shared' }" role="tab" :aria-selected="activeView === 'shared'" @click="activeView = 'shared'">已分享 <span>{{ sharedCount }}</span></button>
        <button type="button" :class="{ 'is-active': activeView === 'unshared' }" role="tab" :aria-selected="activeView === 'unshared'" @click="activeView = 'unshared'">未分享 <span>{{ unsharedCount }}</span></button>
        <button type="button" aria-label="新建文档" @click="createDoc"><Plus :size="15" /></button>
      </div>

      <div class="doc-list-page__workspace">
        <div class="doc-list-page__ledger">
          <div class="doc-list-page__table-tools">
            <button class="cd-button" type="button" @click="cycleSortMode"><ArrowUpDown :size="15" />{{ sortLabel }}</button>
            <button class="cd-button" type="button" @click="resetFilters"><ListFilter :size="15" />重置筛选</button>
            <button class="cd-button is-square" type="button" :class="{ 'is-active': compactMode }" aria-label="紧凑视图" @click="compactMode = !compactMode"><Grid3X3 :size="15" /></button>
          </div>

          <div v-if="docs.loadingList" class="doc-list-page__skeleton">
            <span v-for="i in 6" :key="i" class="cd-skeleton" />
          </div>

          <div v-else-if="listErrorText" class="doc-list-page__error">
            <strong>文档列表加载失败</strong>
            <p>{{ listErrorText }}</p>
            <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
          </div>

          <EmptyState v-else-if="!visibleDocs.length" title="没有文档">
            <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
          </EmptyState>

          <div v-else class="doc-list-page__table" :class="{ 'is-compact': compactMode }">
            <div class="doc-list-page__table-head" aria-hidden="true">
              <span></span>
              <span>文档名称</span>
              <span>状态</span>
              <span>所有者</span>
              <span>更新时间</span>
              <span>分享</span>
              <span>操作</span>
            </div>
            <article
              v-for="doc in visibleDocs"
              :key="doc.id"
              class="doc-list-page__row"
              :class="{ 'is-selected': selectedDocIds.has(doc.id) }"
              role="button"
              tabindex="0"
              @click="openOrToggleDoc(doc.id)"
              @keydown="handleRowKeydown($event, doc.id)"
            >
              <label class="doc-list-page__select" @click.stop>
                <input :checked="selectedDocIds.has(doc.id)" type="checkbox" @change="toggleDocSelection(doc.id)" />
                <span></span>
              </label>
              <span class="doc-list-page__row-title">
                <i><FileText :size="17" /></i>
                <strong>{{ doc.title }}</strong>
                <small v-if="query && docPreviewText(doc)">{{ docPreviewText(doc) }}</small>
                <small v-else>/ {{ doc.id }}</small>
              </span>
              <span>{{ statusText(doc.status) }}</span>
              <span class="doc-list-page__owner"><img :src="logoUrl" alt="" />{{ ownerName }}</span>
              <span>{{ formatDate(doc.updatedAt) }}</span>
              <code>{{ shareStatusText(doc) }}</code>
              <span class="doc-list-page__ops" @click.stop>
                <button type="button" :class="{ 'is-active': doc.pinned }" aria-label="收藏" @click="togglePinned(doc)"><Star :size="16" /></button>
                <button type="button" :aria-label="doc.shareCode ? '打开分享' : '创建分享'" @click="openShare(doc)"><MoreHorizontal :size="17" /></button>
              </span>
            </article>
          </div>
          <button v-if="docs.listHasMore" class="cd-button doc-list-page__more" type="button" :disabled="docs.loadingList" @click="loadMore">
            {{ docs.loadingList ? "加载中..." : "加载更多" }}
          </button>
        </div>

        <aside class="doc-list-page__toolbox" aria-label="文档概览">
          <section class="doc-list-page__storage">
            <strong>存储概览</strong>
            <div class="doc-list-page__ring" :style="{ '--storage-percent': `${storagePercent}%` }"><span>{{ storageFileCount || "" }}</span></div>
            <p>{{ formatBytes(storageTotalBytes) }} · {{ storageFileCount }} 个上传记录</p>
            <RouterLink v-if="auth.canAccessAdmin" class="cd-button" to="/admin/settings/storage">管理存储</RouterLink>
          </section>

          <section>
            <strong>快捷操作</strong>
            <input ref="uploadInput" class="doc-list-page__file-input" type="file" @change="handleUpload" />
            <button class="doc-list-page__toolbox-action" type="button" :disabled="uploading" @click="triggerUpload"><UploadCloud :size="16" /><span>{{ uploading ? "上传中" : "上传文档" }}</span></button>
            <button class="doc-list-page__toolbox-action" type="button" @click="createFolder"><FolderPlus :size="16" /><span>新建空间</span></button>
            <button class="doc-list-page__toolbox-action" type="button" @click="createTemplateDoc"><FilePlus2 :size="16" /><span>从模板新建</span></button>
            <button class="doc-list-page__toolbox-action" type="button" :disabled="uploading" @click="triggerUpload"><Import :size="16" /><span>导入文档</span></button>
            <p v-if="actionMessage" class="doc-list-page__toolbox-message">{{ actionMessage }}</p>
          </section>

          <section>
            <strong>最近动态 <RouterLink :to="docsPath">查看全部</RouterLink></strong>
            <article v-for="doc in recentDocs" :key="doc.id">
              <FileText :size="16" />
              <span><b>{{ doc.title }}</b><small>已更新 · {{ formatDate(doc.updatedAt) }}</small></span>
            </article>
          </section>
        </aside>
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
