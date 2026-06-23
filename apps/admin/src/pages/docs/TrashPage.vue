<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Archive, Clock, HardDrive, RotateCcw, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import {
  bulkHardDeleteTrashDocsApi,
  bulkRestoreTrashDocsApi,
  getTrashStatsApi,
  hardDeleteDocApi,
  listTrashDocsApi,
  restoreDocApi,
  type DocSummary,
  type TrashStats
} from "../../api/docs";
import { useIsMobileViewport } from "../../composables/useViewport";
import "./css/trash.css";

const isMobile = useIsMobileViewport();
const docs = ref<DocSummary[]>([]);
const loading = ref(false);
const operating = ref(false);
const removing = ref<DocSummary | null>(null);
const bulkRestoring = ref(false);
const bulkRemoving = ref(false);
const selectedDocUids = ref<string[]>([]);
const page = ref(1);
const hasMore = ref(false);
// ===== 回收站优化：时间筛选 =====
const timeFilter = ref<"all" | "today" | "week" | "month">("all");
const newestFirst = ref(true);

// ===== 回收站优化：真实统计 =====
const trashStats = ref<TrashStats | null>(null);

const selectedCount = computed(() => selectedDocUids.value.length);
const allSelected = computed(() => docs.value.length > 0 && selectedDocUids.value.length === docs.value.length);
const recoverableCount = computed(() => docs.value.length);

// 可释放空间（GB）
const releaseSize = computed(() => {
  if (!trashStats.value) return 0;
  return Math.round(trashStats.value.storageUsedBytes / (1024 * 1024 * 1024) * 10) / 10;
});

// 存储使用百分比
const storagePercent = computed(() => {
  if (!trashStats.value) return 0;
  return Math.min(100, Math.round((trashStats.value.storageUsedBytes / trashStats.value.storageTotalBytes) * 100));
});

// 格式化存储大小
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const usedStorageText = computed(() => {
  if (!trashStats.value) return "--";
  return `${formatBytes(trashStats.value.storageUsedBytes)} / ${formatBytes(trashStats.value.storageTotalBytes)}`;
});

// ===== 回收站优化：时间筛选计算 =====
const filteredDocs = computed(() => {
  const filtered = timeFilter.value === "all" ? docs.value : docs.value.filter((doc) => {
    if (!doc.deletedAt) return false;
    const deletedTime = new Date(doc.deletedAt).getTime();
    const diffDays = (Date.now() - deletedTime) / 86_400_000;
    if (timeFilter.value === "today") return diffDays < 1;
    if (timeFilter.value === "week") return diffDays < 7;
    if (timeFilter.value === "month") return diffDays < 30;
    return true;
  });
  return [...filtered].sort((left, right) => {
    const delta = new Date(right.deletedAt || 0).getTime() - new Date(left.deletedAt || 0).getTime();
    return newestFirst.value ? delta : -delta;
  });
});

// ===== 回收站优化：真实删除倒计时 =====
const trashRetentionDays = computed(() => trashStats.value?.retentionDays ?? 7);

function getRetentionDaysLeft(deletedAt?: string | null): number {
  if (!deletedAt) return trashRetentionDays.value;
  const deletedTime = new Date(deletedAt).getTime();
  const daysPassed = (Date.now() - deletedTime) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(trashRetentionDays.value - daysPassed));
}

function getRetentionText(deletedAt?: string | null): string {
  const daysLeft = getRetentionDaysLeft(deletedAt);
  if (daysLeft <= 0) return "即将清除";
  if (daysLeft === 1) return "明天清除";
  return `${daysLeft}天后清除`;
}

async function load(options: { append?: boolean } = {}) {
  const nextPage = options.append ? page.value + 1 : 1;
  loading.value = true;
  try {
    const response = await listTrashDocsApi({ page: nextPage, pageSize: 30 });
    docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
    page.value = response.pagination?.page ?? nextPage;
    hasMore.value = response.pagination?.hasMore ?? false;
    selectedDocUids.value = selectedDocUids.value.filter((uid) => docs.value.some((doc) => doc.docUid === uid));
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  void load({ append: true });
}

function removeDocs(docUids: string[]) {
  const uidSet = new Set(docUids);
  docs.value = docs.value.filter((doc) => !uidSet.has(doc.docUid));
  selectedDocUids.value = selectedDocUids.value.filter((uid) => !uidSet.has(uid));
}

function toggleSelection(docUid: string, checked: boolean) {
  selectedDocUids.value = checked
    ? Array.from(new Set([...selectedDocUids.value, docUid]))
    : selectedDocUids.value.filter((selectedUid) => selectedUid !== docUid);
}

function toggleAll(checked: boolean) {
  selectedDocUids.value = checked ? docs.value.map((doc) => doc.docUid) : [];
}

async function restore(docUid: string) {
  operating.value = true;
  try {
    await restoreDocApi(docUid);
    removeDocs([docUid]);
    void loadStats();
  } finally {
    operating.value = false;
  }
}

async function bulkRestore() {
  if (!selectedDocUids.value.length) return;
  operating.value = true;
  try {
    const response = await bulkRestoreTrashDocsApi(selectedDocUids.value);
    removeDocs(response.restoredDocUids);
    void loadStats();
  } finally {
    bulkRestoring.value = false;
    operating.value = false;
  }
}

async function hardDelete() {
  if (!removing.value) return;
  operating.value = true;
  const docUid = removing.value.docUid;
  try {
    await hardDeleteDocApi(docUid);
    removeDocs([docUid]);
    void loadStats();
  } finally {
    removing.value = null;
    operating.value = false;
  }
}

async function bulkHardDelete() {
  if (!selectedDocUids.value.length) return;
  operating.value = true;
  try {
    const response = await bulkHardDeleteTrashDocsApi(selectedDocUids.value);
    removeDocs(response.deletedDocUids);
    void loadStats();
  } finally {
    bulkRemoving.value = false;
    operating.value = false;
  }
}

async function loadStats() {
  try {
    trashStats.value = await getTrashStatsApi();
  } catch {
    // 静默失败，使用默认值
  }
}

onMounted(() => {
  void load();
  void loadStats();
});

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
</script>

<template>
  <section class="trash-page" :class="{ 'is-mobile': isMobile }">
    <div class="trash-page__head">
      <div>
        <h1>回收站</h1>
        <p>已删除内容保留 {{ trashStats?.retentionDays || 7 }} 天，过期后自动永久清理。</p>
      </div>
      <div v-if="filteredDocs.length" class="trash-page__head-actions">
        <button class="cd-button" type="button" :disabled="!selectedCount || operating" @click="bulkRestoring = true">
          <RotateCcw :size="16" />批量恢复
        </button>
        <button class="cd-button danger" type="button" :disabled="!selectedCount || operating" @click="bulkRemoving = true">
          <Trash2 :size="16" />批量永久删除
        </button>
      </div>
    </div>

    <div v-if="filteredDocs.length" class="trash-page__stats">
      <article><span><Archive :size="27" /></span><b>待清理文档</b><strong>{{ filteredDocs.length }}</strong><small>筛选后数量</small></article>
      <article><span class="is-green"><RotateCcw :size="27" /></span><b>可恢复项目</b><strong>{{ recoverableCount }}</strong><small>可恢复文档和文件</small></article>
      <article><span><HardDrive :size="27" /></span><b>已释放空间潜力</b><strong>{{ releaseSize }} GB</strong><small>永久删除后可释放</small></article>
    </div>

    <div class="trash-page__layout">
      <main class="trash-page__main">
        <div class="trash-page__toolbar">
          <div class="trash-page__filters">
            <button type="button" :class="{ 'is-active': timeFilter === 'all' }" @click="timeFilter = 'all'">全部</button>
            <button type="button" :class="{ 'is-active': timeFilter === 'today' }" @click="timeFilter = 'today'">今天删除</button>
            <button type="button" :class="{ 'is-active': timeFilter === 'week' }" @click="timeFilter = 'week'">7天内</button>
            <button type="button" :class="{ 'is-active': timeFilter === 'month' }" @click="timeFilter = 'month'">30天内</button>
          </div>
          <div class="trash-page__sort">
            <button class="cd-button" type="button" @click="newestFirst = !newestFirst"><Clock :size="15" />按删除时间（{{ newestFirst ? "最新" : "最早" }}）</button>
          </div>
        </div>

        <div v-if="loading" class="trash-page__skeleton">
          <span v-for="i in 4" :key="i" class="cd-skeleton" />
        </div>

        <div v-else-if="!filteredDocs.length" class="trash-page__empty cd-card">
          <p>筛选范围内没有文档</p>
        </div>

        <div v-else class="trash-page__table">
          <div class="trash-page__bulkbar">
            <label class="trash-page__select">
              <input type="checkbox" :checked="allSelected" :disabled="operating" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
              <span>文档名称</span>
            </label>
            <span>所有者</span>
            <span>删除时间</span>
            <span>保留剩余</span>
            <span>删除者</span>
            <span>操作</span>
          </div>
          <div v-for="doc in filteredDocs" :key="doc.docUid" class="trash-page__row">
            <label class="trash-page__select" :aria-label="`选择 ${doc.title}`">
              <input
                type="checkbox"
                :checked="selectedDocUids.includes(doc.docUid)"
                :disabled="operating"
                @change="toggleSelection(doc.docUid, ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <div>
              <strong>{{ doc.title }}</strong>
              <span>/ 文档 / {{ doc.docUid }}</span>
            </div>
            <span>{{ doc.ownerUsername || doc.ownerId || "已注销用户" }}</span>
            <span>{{ formatDate(doc.deletedAt) }}</span>
            <span class="trash-page__pill" :class="{ 'is-urgent': getRetentionDaysLeft(doc.deletedAt) <= 1 }">
              {{ getRetentionText(doc.deletedAt) }}
            </span>
            <span>{{ doc.deletedBy ? `用户 #${doc.deletedBy}` : "系统清理" }}</span>
            <div class="trash-page__actions">
              <button class="cd-button" type="button" :disabled="operating" @click="restore(doc.docUid)">
                <RotateCcw :size="16" />恢复
              </button>
              <button class="cd-button danger" type="button" :disabled="operating" @click="removing = doc">
                <Trash2 :size="16" />永久删除
              </button>
            </div>
          </div>
          <button v-if="hasMore" class="cd-button trash-page__more" type="button" :disabled="loading" @click="loadMore">
            {{ loading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </main>

      <aside class="trash-page__aside">
        <section>
          <strong>存储释放概览</strong>
          <div class="trash-page__ring"><span>{{ storagePercent }}%</span></div>
          <p>已用 {{ usedStorageText }}</p>
        </section>
        <section>
          <strong>清理建议</strong>
          <p>及时恢复重要文件</p>
          <p>永久删除过期文件</p>
          <p>定期清理回收站</p>
        </section>
        <section>
          <strong>最早删除</strong>
          <article v-for="doc in docs.slice(0, 3)" :key="doc.docUid">
            <b>{{ doc.title }}</b>
            <small>{{ formatDate(doc.deletedAt) }}</small>
          </article>
        </section>
      </aside>
    </div>

    <ConfirmDialog
      :model-value="!!removing"
      danger
      title="永久删除"
      :message="`确定永久删除「${removing?.title || ''}」吗？这个操作不可恢复。`"
      confirm-text="永久删除"
      @update:model-value="(value) => { if (!value) removing = null }"
      @confirm="hardDelete"
    />
    <ConfirmDialog
      v-model="bulkRestoring"
      title="批量恢复"
      :message="`确定恢复选中的 ${selectedCount} 篇文档吗？`"
      confirm-text="恢复"
      @confirm="bulkRestore"
    />
    <ConfirmDialog
      v-model="bulkRemoving"
      danger
      title="批量永久删除"
      :message="`确定永久删除选中的 ${selectedCount} 篇文档吗？这个操作不可恢复。`"
      confirm-text="永久删除"
      @confirm="bulkHardDelete"
    />
  </section>
</template>
