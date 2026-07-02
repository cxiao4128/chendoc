<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderPlus,
  Grid3X3,
  LayoutGrid,
  List,
  ListFilter,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  UploadCloud
} from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import KanbanBoard from "../../components/docs/KanbanBoard.vue";
import { normalizeError } from "../../utils/error";
import EmptyState from "../../components/common/EmptyState.vue";
import { createShareApi } from "../../api/shares";
import { createSpaceApi, listSpacesApi } from "../../api/spaces";
import { getSystemStatusApi, listManagedUsersApi, listOperationLogsApi, type OperationLogView, type SystemStatusView } from "../../api/settings";
import { useAuth } from "../../composables/useAuth";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useUpload } from "../../composables/useUpload";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { nativePrompt } from "../../services/nativeDialog";
import { useDocStore } from "../../stores/doc";
import { bundledLogoUrl as logoUrl } from "../../config/site-assets";
import "./css/doc-list.css";

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

type DocViewFilter = "all" | "published" | "draft" | "review" | "shared" | "unshared" | "kanban";
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
const spaceFilter = ref("all");
const tagFilter = ref("all");
const updatedFilter = ref<"all" | "day" | "week" | "month">("all");
const spaces = ref<Array<{ id: number; name: string }>>([]);
const allDocs = computed(() => docs.docs);

function docTags(doc: { tags?: string[] | string | null }) {
  if (Array.isArray(doc.tags)) return doc.tags;
  if (typeof doc.tags !== "string") return [];
  try { return JSON.parse(doc.tags) as string[]; } catch { return []; }
}

// 单一派生数据源 - 单次遍历计算所有统计数据
const docStats = computed(() => {
  const docs = allDocs.value;
  let published = 0, shared = 0, review = 0, draft = 0, unshared = 0;
  const tags = new Set<string>();
  for (const doc of docs) {
    if (doc.status === "published") published++;
    else draft++;
    if (doc.shareCode && doc.shareEnabled) shared++;
    else unshared++;
    if (doc.shareReviewStatus === "pending") review++;
    docTags(doc).forEach(t => tags.add(t));
  }
  return {
    total: docs.length,
    published, shared, review, draft, unshared,
    availableTags: Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-CN"))
  };
});

// 统计派生属性（复用 docStats）
const totalCount = computed(() => docStats.value.total);
const publishedCount = computed(() => docStats.value.published);
const sharedCount = computed(() => docStats.value.shared);
const reviewCount = computed(() => docStats.value.review);
const draftCount = computed(() => docStats.value.draft);
const unsharedCount = computed(() => docStats.value.unshared);
const availableTags = computed(() => docStats.value.availableTags);
const visibleDocs = computed(() => {
  const viewFiltered = activeView.value === "published"
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
  const cutoff = updatedFilter.value === "day" ? Date.now() - 86_400_000
    : updatedFilter.value === "week" ? Date.now() - 7 * 86_400_000
      : updatedFilter.value === "month" ? Date.now() - 30 * 86_400_000 : 0;
  const filtered = viewFiltered.filter((doc) => {
    if (spaceFilter.value !== "all" && String(doc.spaceId || "none") !== spaceFilter.value) return false;
    if (tagFilter.value !== "all" && !docTags(doc).includes(tagFilter.value)) return false;
    return !cutoff || new Date(doc.updatedAt).getTime() >= cutoff;
  });
  return [...filtered].sort((left, right) => {
    if (sortMode.value === "titleAsc") return left.title.localeCompare(right.title, "zh-CN");
    if (sortMode.value === "createdDesc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
});
const searchKeyword = ref(query.value);
const localListError = ref("");
const bulkMode = ref(false);
const selectedDocUids = ref<Set<string>>(new Set());
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);
const sortMode = ref<SortMode>((route.query.sort as SortMode) || "updatedDesc");
const compactMode = ref(false);
const viewMode = ref<"list" | "kanban">("list");
const kanbanGroupBy = ref<"status" | "tag">("status");
const actionMessage = ref("");
const uploading = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);
const systemStatus = ref<SystemStatusView | null>(null);
const managedUserCount = ref(1);
const recentActivity = ref<OperationLogView[]>([]);
const toolboxCollapsed = ref(false);
const recentSearches = ref<string[]>([]);
let searchTimer: number | null = null;
const listErrorText = computed(() => normalizeError((docs as unknown as DocStoreCompat).listError) || localListError.value);
const selectedCount = computed(() => selectedDocUids.value.size);
const allVisibleSelected = computed(() => !!visibleDocs.value.length && visibleDocs.value.every((doc) => selectedDocUids.value.has(doc.docUid)));
const ownerName = computed(() => auth.user?.username || "xchen");
const showOwnerColumn = computed(() => managedUserCount.value > 1 || allDocs.value.some((doc) => doc.ownerId !== auth.user?.id));
const storageTotalBytes = computed(() => systemStatus.value?.storage.totalBytes || 0);
const storageFileCount = computed(() => systemStatus.value?.storage.fileCount || 0);
const sortLabel = computed(() => {
  if (sortMode.value === "createdDesc") return "按创建时间";
  if (sortMode.value === "titleAsc") return "按标题";
  return "按更新时间";
});

function cycleSortMode() {
  sortMode.value = sortMode.value === "updatedDesc" ? "createdDesc" : sortMode.value === "createdDesc" ? "titleAsc" : "updatedDesc";
  // 排序状态 URL 持久化
  router.replace({ path: route.path, query: { ...route.query, sort: sortMode.value } });
}

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(docPath(doc.docUid));
}

async function createTemplateDoc() {
  const doc = await docs.createDoc("新建模板文档");
  await docs.saveDoc(doc.docUid, {
    contentHtml: "<h2>模板标题</h2><p>在这里写正文。可改成常用方案、说明书、周报或知识卡片。</p>",
    summary: "模板中心创建"
  });
  router.push(docPath(doc.docUid));
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

function rememberSearch(value: string) {
  const next = value.trim();
  if (!next) return;
  recentSearches.value = [next, ...recentSearches.value.filter((item) => item !== next)].slice(0, 5);
  localStorage.setItem("chendoc_recent_searches", JSON.stringify(recentSearches.value));
}

function toggleToolbox() {
  toolboxCollapsed.value = !toolboxCollapsed.value;
  localStorage.setItem("chendoc_docs_toolbox_collapsed", toolboxCollapsed.value ? "1" : "0");
}

function openActivity(log: OperationLogView) {
  if (log.targetType === "doc" && /^[A-Za-z0-9_-]{16,32}$/.test(log.targetId)) router.push(docPath(log.targetId));
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploading.value = true;
  actionMessage.value = "";
  try {
    const doc = await docs.createDoc(file.name.replace(/\.[^.]+$/, "") || "导入文档");
    const url = await uploader.uploadFile(file, doc.docUid);
    await docs.saveDoc(doc.docUid, {
      summary: `上传文件：${file.name}`,
      contentHtml: `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a></p>`
    });
    await loadSystemStatus();
    router.push(docPath(doc.docUid));
  } finally {
    uploading.value = false;
  }
}

async function togglePinned(doc: { docUid: string; pinned?: boolean }) {
  await docs.saveDoc(doc.docUid, { pinned: !doc.pinned });
  await load();
}

function openKanbanDoc(docUid: string) {
  router.push(docPath(docUid));
}

async function openShare(doc: { docUid: string; shareCode?: number | null; customSlug?: string | null }) {
  if (!doc.shareCode) {
    await createShareApi(doc.docUid);
    await load();
    return;
  }
  window.open(sharePath(doc), "_blank", "noopener,noreferrer");
}

function resetFilters() {
  activeView.value = "all";
  sortMode.value = "updatedDesc";
  searchKeyword.value = "";
  spaceFilter.value = "all";
  tagFilter.value = "all";
  updatedFilter.value = "all";
  router.replace({ path: docsPath.value });
}

async function loadSystemStatus() {
  const [statusResult, logsResult, usersResult, spacesResult] = await Promise.allSettled([
    auth.canAccessAdmin ? getSystemStatusApi() : Promise.resolve(null),
    auth.canAccessAdmin ? listOperationLogsApi() : Promise.resolve(null),
    auth.canAccessAdmin ? listManagedUsersApi() : Promise.resolve({ users: [auth.user] }),
    listSpacesApi()
  ]);
  systemStatus.value = statusResult.status === "fulfilled" ? statusResult.value?.status ?? null : null;
  recentActivity.value = logsResult.status === "fulfilled" ? logsResult.value?.logs.slice(0, 5) ?? [] : [];
  managedUserCount.value = usersResult.status === "fulfilled" ? usersResult.value.users.length : 1;
  spaces.value = spacesResult.status === "fulfilled" ? spacesResult.value.spaces : [];
}

function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }) {
  return doc.shareCode ? `/r/${doc.shareCode}` : "未分享";
}

function shareStatusText(doc: { status?: string; shareCode?: number | null; customSlug?: string | null; shareEnabled?: boolean | null; shareReviewStatus?: string | null }) {
  if (doc.status !== "published") return "草稿";
  if (!doc.shareCode) return "已发布 · 未公开";
  if (doc.shareReviewStatus === "pending") return `已发布 → 待审核 · ${doc.shareCode}`;
  if (doc.shareReviewStatus === "rejected") return `已发布 → 已拒绝 · ${doc.shareCode}`;
  if (doc.shareEnabled) return `已发布 → 已公开 · ${doc.shareCode}`;
  return `已发布 → 已关闭 · ${doc.shareCode}`;
}

function activityText(log: OperationLogView) {
  if (log.action === "doc.create") return "新建文档";
  if (log.action.includes("restore")) return "恢复文档";
  if (log.action.includes("delete")) return "删除文档";
  if (log.action.includes("publish")) return "发布文档";
  if (log.action.startsWith("share.")) return "更新分享";
  return "更新文档";
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

function docPreviewParts(doc: DocPreview): Array<{ text: string; highlighted: boolean }> {
  const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
  const text = normalizePreview(source);
  if (!text) return [];
  const clamped = clampPreview(text, query.value);
  if (!query.value) return [{ text: clamped, highlighted: false }];
  const escaped = query.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return clamped.split(regex).filter(Boolean).map((part) => ({
    text: part,
    highlighted: part.toLowerCase() === query.value.toLowerCase()
  }));
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

function setSelectedDocUids(nextUids: Iterable<string>) {
  selectedDocUids.value = new Set(nextUids);
}

function enterBulkMode() {
  bulkMode.value = true;
}

function cancelBulkMode() {
  bulkMode.value = false;
  setSelectedDocUids([]);
  bulkDeleteOpen.value = false;
}

function toggleDocSelection(docUid: string) {
  const next = new Set(selectedDocUids.value);
  if (next.has(docUid)) next.delete(docUid);
  else next.add(docUid);
  selectedDocUids.value = next;
}

function toggleAllVisibleDocs() {
  if (allVisibleSelected.value) {
    setSelectedDocUids([]);
    return;
  }
  setSelectedDocUids(visibleDocs.value.map((doc) => doc.docUid));
}

function openOrToggleDoc(docUid: string) {
  if (bulkMode.value) {
    toggleDocSelection(docUid);
    return;
  }
  router.push(docPath(docUid));
}

function handleRowKeydown(event: Event, docUid: string) {
  const keyboardEvent = event as KeyboardEvent;
  if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
  keyboardEvent.preventDefault();
  openOrToggleDoc(docUid);
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
  const docUids = Array.from(selectedDocUids.value);
  if (!docUids.length) return;
  bulkDeleting.value = true;
  try {
    const deletedDocUids = await docs.bulkDeleteDocs(docUids);
    const deletedUidSet = new Set(deletedDocUids);
    setSelectedDocUids(docUids.filter((uid) => !deletedUidSet.has(uid)));
    if (!selectedDocUids.value.size) cancelBulkMode();
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
  rememberSearch(value);
  router.push({ path: docsPath.value, query: value ? { q: value } : {} });
}

function queueSearch(value: string) {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    const normalized = value.trim();
    if (normalized === query.value) return;
    rememberSearch(normalized);
    router.replace({ path: docsPath.value, query: normalized ? { q: normalized } : {} });
  }, 280);
}

function loadMore() {
  void docs.loadMore(query.value);
}

onMounted(() => {
  toolboxCollapsed.value = localStorage.getItem("chendoc_docs_toolbox_collapsed") === "1";
  try { recentSearches.value = JSON.parse(localStorage.getItem("chendoc_recent_searches") || "[]"); } catch { recentSearches.value = []; }
  try {
    const saved = JSON.parse(localStorage.getItem("chendoc_doc_filters") || "{}") as { space?: string; tag?: string; updated?: "all" | "day" | "week" | "month" };
    spaceFilter.value = saved.space || "all";
    tagFilter.value = saved.tag || "all";
    updatedFilter.value = ["all", "day", "week", "month"].includes(saved.updated || "") ? saved.updated! : "all";
  } catch {
    localStorage.removeItem("chendoc_doc_filters");
  }
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
watch([spaceFilter, tagFilter, updatedFilter], ([space, tag, updated]) => {
  localStorage.setItem("chendoc_doc_filters", JSON.stringify({ space, tag, updated }));
});
watch(visibleDocs, (items) => {
  const visibleUidSet = new Set(items.map((doc) => doc.docUid));
  setSelectedDocUids(Array.from(selectedDocUids.value).filter((uid) => visibleUidSet.has(uid)));
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
          <Trash2 v-if="bulkMode" :size="16" /><ListFilter v-else :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "选择文档" }}
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
          :key="doc.docUid"
          class="doc-list-page__mobile-card"
          :class="{ 'is-bulk': bulkMode, 'is-selected': selectedDocUids.has(doc.docUid) }"
          role="button"
          tabindex="0"
          @click="openOrToggleDoc(doc.docUid)"
          @keydown="handleRowKeydown($event, doc.docUid)"
        >
          <label v-if="bulkMode" class="doc-list-page__select" @click.stop>
            <input :checked="selectedDocUids.has(doc.docUid)" type="checkbox" @change="toggleDocSelection(doc.docUid)" />
            <span></span>
          </label>
          <div class="doc-list-page__mobile-row">
            <i><FileText :size="18" /></i>
            <div>
              <strong>{{ doc.title }}</strong>
              <p v-if="query && docPreviewText(doc)" class="doc-list-page__mobile-preview"><template v-for="(part, index) in docPreviewParts(doc)" :key="index"><mark v-if="part.highlighted">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></p>
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
          <h1>文档</h1>
          <p>{{ query ? `搜索：${query}` : "整理、检索、编辑和发布你的文档" }}</p>
        </div>
        <div class="doc-list-page__actions">
          <span v-if="bulkMode && selectedCount" class="doc-list-page__bulk-counter">已选 {{ selectedCount }} 篇</span>
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

      <div class="doc-list-page__workspace" :class="{ 'is-toolbox-collapsed': toolboxCollapsed }">
        <div class="doc-list-page__ledger">
          <div class="doc-list-page__table-tools">
            <button class="cd-button" type="button" @click="cycleSortMode"><ArrowUpDown :size="15" />{{ sortLabel }}</button>
            <select v-model="spaceFilter" class="cd-select" aria-label="按空间筛选">
              <option value="all">全部空间</option>
              <option value="none">未分空间</option>
              <option v-for="space in spaces" :key="space.id" :value="String(space.id)">{{ space.name }}</option>
            </select>
            <select v-model="tagFilter" class="cd-select" aria-label="按标签筛选">
              <option value="all">全部标签</option>
              <option v-for="tag in availableTags" :key="tag" :value="tag">{{ tag }}</option>
            </select>
            <select v-model="updatedFilter" class="cd-select" aria-label="按更新时间筛选">
              <option value="all">全部时间</option><option value="day">24 小时内</option><option value="week">7 天内</option><option value="month">30 天内</option>
            </select>
            <button class="cd-button" type="button" @click="resetFilters"><ListFilter :size="15" />重置筛选</button>
            <span class="doc-list-page__view-toggle">
              <button class="cd-button is-square" type="button" :class="{ 'is-active': viewMode === 'list' }" title="列表视图" @click="viewMode = 'list'"><List :size="15" /></button>
              <button class="cd-button is-square" type="button" :class="{ 'is-active': viewMode === 'kanban' }" title="看板视图" @click="viewMode = 'kanban'"><LayoutGrid :size="15" /></button>
            </span>
            <select v-if="viewMode === 'kanban'" v-model="kanbanGroupBy" class="cd-select" aria-label="看板分组">
              <option value="status">按状态</option>
              <option value="tag">按标签</option>
            </select>
            <button class="cd-button is-square" type="button" :class="{ 'is-active': compactMode && viewMode === 'list' }" aria-label="紧凑视图" @click="compactMode = !compactMode"><Grid3X3 :size="15" /></button>
            <button class="cd-button is-square" type="button" :aria-label="toolboxCollapsed ? '展开侧栏' : '折叠侧栏'" @click="toggleToolbox"><component :is="toolboxCollapsed ? PanelRightOpen : PanelRightClose" :size="16" /></button>
          </div>
          <div v-if="recentSearches.length" class="doc-list-page__recent-searches">
            <span>最近搜索</span>
            <button v-for="item in recentSearches" :key="item" type="button" @click="searchKeyword = item">{{ item }}</button>
          </div>

          <div v-if="docs.loadingList" class="doc-list-page__skeleton">
            <span v-for="i in 6" :key="i" class="cd-skeleton" />
          </div>

          <div v-else-if="listErrorText" class="doc-list-page__error">
            <strong>文档列表加载失败</strong>
            <p>{{ listErrorText }}</p>
            <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
          </div>

          <EmptyState v-else-if="!visibleDocs.length" :title="query ? '没有找到文档' : '没有文档'">
            <template v-if="query">
              <p>没有找到包含「{{ query }}」的文档</p>
              <button class="cd-button" type="button" @click="searchKeyword = ''"><X :size="16" />清除搜索</button>
            </template>
            <template v-else>
              <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
            </template>
          </EmptyState>

          <!-- 列表视图 -->
          <div v-if="viewMode === 'list'" class="doc-list-page__table" :class="{ 'is-compact': compactMode, 'has-owner': showOwnerColumn }">
            <div class="doc-list-page__table-head" aria-hidden="true">
              <span></span>
              <span>文档名称</span>
              <span>状态</span>
              <span v-if="showOwnerColumn">所有者</span>
              <span>更新时间</span>
              <span>分享</span>
              <span>操作</span>
            </div>
            <article
              v-for="doc in visibleDocs"
              :key="doc.docUid"
              class="doc-list-page__row"
              :class="{ 'is-selected': selectedDocUids.has(doc.docUid) }"
              role="button"
              tabindex="0"
              @click="openOrToggleDoc(doc.docUid)"
              @keydown="handleRowKeydown($event, doc.docUid)"
            >
              <label class="doc-list-page__select" @click.stop>
                <input :checked="selectedDocUids.has(doc.docUid)" type="checkbox" @change="toggleDocSelection(doc.docUid)" />
                <span></span>
              </label>
              <span class="doc-list-page__row-title">
                <i><FileText :size="17" /></i>
                <strong>{{ doc.title }}</strong>
                <small v-if="query && docPreviewText(doc)"><template v-for="(part, index) in docPreviewParts(doc)" :key="index"><mark v-if="part.highlighted">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></small>
                <small v-else>/ {{ doc.docUid }}</small>
              </span>
              <span>{{ statusText(doc.status) }}</span>
              <span v-if="showOwnerColumn" class="doc-list-page__owner"><img :src="logoUrl" alt="" loading="lazy" />{{ doc.ownerUsername || ownerName }}</span>
              <span>{{ formatDate(doc.updatedAt) }}</span>
              <code>{{ shareStatusText(doc) }}</code>
              <span class="doc-list-page__ops" @click.stop>
                <button type="button" :class="{ 'is-active': doc.pinned }" aria-label="收藏" @click="togglePinned(doc)"><Star :size="16" /></button>
                <button type="button" :aria-label="doc.shareCode ? '打开分享' : '创建分享'" @click="openShare(doc)"><MoreHorizontal :size="17" /></button>
              </span>
            </article>
          </div>

          <!-- 看板视图 -->
          <Transition name="view-switch" mode="out-in">
            <KanbanBoard
              v-if="activeView === 'kanban'"
              :docs="visibleDocs"
              :group-by="kanbanGroupBy"
              :on-doc-click="openKanbanDoc"
              :on-doc-star="togglePinned"
            />
          </Transition>
          <button v-if="docs.listHasMore" class="cd-button doc-list-page__more" type="button" :disabled="docs.loadingList" @click="loadMore">
            {{ docs.loadingList ? "加载中..." : "加载更多" }}
          </button>
        </div>

        <aside v-if="!toolboxCollapsed" class="doc-list-page__toolbox" aria-label="文档概览">
          <section v-if="auth.canAccessAdmin" class="doc-list-page__storage">
            <strong>存储概览</strong>
            <div class="doc-list-page__ring"><span>{{ storageFileCount }}</span></div>
            <p>{{ formatBytes(storageTotalBytes) }} · {{ storageFileCount }} 个上传记录</p>
            <RouterLink v-if="auth.canAccessAdmin" class="cd-button" to="/admin/settings/storage">管理存储</RouterLink>
          </section>

          <section>
            <strong>快捷操作</strong>
            <input ref="uploadInput" class="doc-list-page__file-input" type="file" @change="handleUpload" />
            <button class="doc-list-page__toolbox-action" type="button" :disabled="uploading" @click="triggerUpload"><UploadCloud :size="16" /><span>{{ uploading ? "导入中" : "导入附件文档" }}</span></button>
            <button class="doc-list-page__toolbox-action" type="button" @click="createFolder"><FolderPlus :size="16" /><span>新建空间</span></button>
            <button class="doc-list-page__toolbox-action" type="button" @click="createTemplateDoc"><FilePlus2 :size="16" /><span>从模板新建</span></button>
            <p v-if="actionMessage" class="doc-list-page__toolbox-message">{{ actionMessage }}</p>
          </section>

          <section>
            <strong>最近动态 <RouterLink :to="docsPath">查看全部</RouterLink></strong>
            <button v-for="log in recentActivity" :key="log.id" class="doc-list-page__activity" type="button" @click="openActivity(log)">
              <FileText :size="16" />
              <span><b>{{ activityText(log) }}</b><small>{{ log.targetId }} · {{ formatDate(log.createdAt) }}</small></span>
            </button>
            <p v-if="!recentActivity.length">暂无真实操作记录</p>
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
