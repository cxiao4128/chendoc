<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowUpDown,
  BarChart2,
  Copy,
  FileText,
  Grid3X3,
  Link,
  ListFilter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2
} from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { normalizeError } from "../../utils/error";
import EmptyState from "../../components/common/EmptyState.vue";
import { listFormsApi, deleteFormApi, type FormItem } from "../../api/forms";
import "./css/form-list.css";

type FormViewFilter = "all" | "published" | "draft" | "closed";
type SortMode = "updatedDesc" | "createdDesc" | "titleAsc";

const router = useRouter();

const activeView = ref<FormViewFilter>("all");
const allForms = ref<FormItem[]>([]);
const visibleForms = computed(() => {
  const filtered = activeView.value === "published"
    ? allForms.value.filter((f) => f.status === "published")
    : activeView.value === "draft"
      ? allForms.value.filter((f) => f.status === "draft")
      : activeView.value === "closed"
        ? allForms.value.filter((f) => f.status === "closed")
        : allForms.value;
  return [...filtered].sort((left, right) => {
    if (sortMode.value === "titleAsc") return left.title.localeCompare(right.title, "zh-CN");
    if (sortMode.value === "createdDesc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
});

const loading = ref(false);
const localError = ref("");
const sortMode = ref<SortMode>("updatedDesc");
const compactMode = ref(false);
const selectedFormIds = ref<Set<number>>(new Set());
const bulkMode = ref(false);
const deleteDialogOpen = ref(false);
const deletingId = ref<number | null>(null);
const bulkDeleteOpen = ref(false);
const bulkDeleting = ref(false);
const copiedUid = ref<string | null>(null);

const totalCount = computed(() => allForms.value.length);
const publishedCount = computed(() => allForms.value.filter((f) => f.status === "published").length);
const draftCount = computed(() => allForms.value.filter((f) => f.status === "draft").length);
const closedCount = computed(() => allForms.value.filter((f) => f.status === "closed").length);
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

function statusLabel(status: string) {
  return status === "published" ? "已发布" : status === "draft" ? "草稿" : "已关闭";
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

async function loadForms() {
  loading.value = true;
  localError.value = "";
  try {
    const res = await listFormsApi();
    allForms.value = res.forms;
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
  const url = `${location.origin}/f/${formUid}`;
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
  selectedFormIds.value = new Set(visibleForms.value.map((f) => f.id));
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
    await deleteFormApi(deletingId.value);
    allForms.value = allForms.value.filter((f) => f.id !== deletingId.value);
  } catch (e) {
    localError.value = e instanceof Error ? e.message : "删除失败";
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
      await deleteFormApi(id);
    }
    allForms.value = allForms.value.filter((f) => !selectedFormIds.value.has(f.id));
    selectedFormIds.value = new Set();
    cancelBulkMode();
  } catch (e) {
    localError.value = e instanceof Error ? e.message : "批量删除失败";
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
</script>

<template>
  <section class="doc-list-page">
    <div class="doc-list-page__head">
      <div>
        <h1>收集表</h1>
        <p>创建表单，收集并管理提交记录。</p>
      </div>
      <div class="doc-list-page__actions">
        <span v-if="bulkMode && selectedCount" class="doc-list-page__bulk-counter">已选 {{ selectedCount }} 个</span>
        <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="onBulkDeleteClick">
          <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量操作" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="toggleAllVisibleForms">
          {{ selectedCount === visibleForms.length ? "取消全选" : "全选" }}
        </button>
        <button v-if="bulkMode" class="cd-button" type="button" @click="cancelBulkMode">取消</button>
        <button class="cd-button primary" type="button" @click="createForm"><Plus :size="16" />新建表单</button>
      </div>
    </div>

    <div class="doc-list-page__filter-tabs" role="tablist" aria-label="收集表视图">
      <button type="button" :class="{ 'is-active': activeView === 'all' }" role="tab" :aria-selected="activeView === 'all'" @click="activeView = 'all'">全部 <span>{{ totalCount }}</span></button>
      <button type="button" :class="{ 'is-active': activeView === 'published' }" role="tab" :aria-selected="activeView === 'published'" @click="activeView = 'published'">已发布 <span>{{ publishedCount }}</span></button>
      <button type="button" :class="{ 'is-active': activeView === 'draft' }" role="tab" :aria-selected="activeView === 'draft'" @click="activeView = 'draft'">草稿 <span>{{ draftCount }}</span></button>
      <button type="button" :class="{ 'is-active': activeView === 'closed' }" role="tab" :aria-selected="activeView === 'closed'" @click="activeView = 'closed'">已关闭 <span>{{ closedCount }}</span></button>
      <button type="button" aria-label="新建表单" @click="createForm"><Plus :size="15" /></button>
    </div>

    <div class="doc-list-page__workspace is-toolbox-collapsed">
      <div class="doc-list-page__ledger">
        <div class="doc-list-page__table-tools">
          <button class="cd-button" type="button" @click="cycleSortMode"><ArrowUpDown :size="15" />{{ sortLabel }}</button>
          <button class="cd-button" type="button" @click="resetFilters"><ListFilter :size="15" />重置筛选</button>
          <button class="cd-button is-square" type="button" :class="{ 'is-active': compactMode }" aria-label="紧凑视图" @click="compactMode = !compactMode"><Grid3X3 :size="15" /></button>
        </div>

        <div v-if="loading" class="doc-list-page__skeleton">
          <span v-for="i in 6" :key="i" class="cd-skeleton" />
        </div>

        <div v-else-if="errorText" class="doc-list-page__error">
          <strong>收集表加载失败</strong>
          <p>{{ errorText }}</p>
          <button class="cd-button primary" type="button" @click="retryLoad"><RefreshCw :size="16" />重试</button>
        </div>

        <EmptyState v-else-if="!visibleForms.length" title="没有收集表">
          <button class="cd-button primary" type="button" @click="createForm"><Plus :size="16" />新建表单</button>
        </EmptyState>

        <div v-else class="doc-list-page__table" :class="{ 'is-compact': compactMode }">
          <div class="doc-list-page__table-head" aria-hidden="true">
            <span></span>
            <span>表单名称</span>
            <span>状态</span>
            <span>更新时间</span>
            <span>访问与提交</span>
            <span>操作</span>
          </div>
          <article
            v-for="form in visibleForms"
            :key="form.id"
            class="doc-list-page__row"
            :class="{ 'is-selected': selectedFormIds.has(form.id), 'is-bulk': bulkMode }"
            role="button"
            tabindex="0"
            @click="openOrToggleForm(form.id)"
            @keydown="(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOrToggleForm(form.id); } }"
          >
            <label class="doc-list-page__select" @click.stop>
              <input :checked="selectedFormIds.has(form.id)" type="checkbox" @change="toggleFormSelection(form.id)" />
              <span></span>
            </label>
            <span class="doc-list-page__row-title">
              <i><FileText :size="17" /></i>
              <strong>{{ form.title }}</strong>
              <small v-if="form.description">{{ form.description }}</small>
              <small v-else>/ {{ form.formUid }}</small>
            </span>
            <span :class="`status-${form.status}`">{{ statusLabel(form.status) }}</span>
            <span>{{ formatDate(form.updatedAt) }}</span>
            <code>{{ form.viewCount }} 访问 · {{ form.submissionCount }} 提交</code>
            <span class="doc-list-page__ops" @click.stop>
              <button type="button" aria-label="编辑" @click="editForm(form.id)"><MoreHorizontal :size="17" /></button>
              <button type="button" aria-label="查看结果" @click="viewSubmissions(form.id)"><BarChart2 :size="16" /></button>
              <button type="button" :disabled="form.status !== 'published'" :aria-label="form.status === 'published' ? (copiedUid === form.formUid ? '已复制' : '复制公开链接') : '发布后可复制链接'" @click="copyLink(form)">
                <span v-if="copiedUid === form.formUid"><Copy :size="16" />已复制</span>
                <Link v-else :size="16" />
              </button>
            </span>
          </article>
        </div>
      </div>

    </div>

    <ConfirmDialog
      v-model="deleteDialogOpen"
      danger
      title="确认删除"
      message="删除后无法恢复，确定要删除这个表单吗？"
      confirm-text="删除"
      @confirm="doDeleteForm"
    />

    <ConfirmDialog
      v-model="bulkDeleteOpen"
      danger
      title="批量删除"
      :message="`确认将选中的 ${selectedCount} 个表单删除吗？删除后无法恢复。`"
      confirm-text="批量删除"
      @confirm="confirmBulkDelete"
    />
  </section>
</template>
