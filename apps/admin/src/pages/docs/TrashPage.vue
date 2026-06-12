<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Archive, Clock, HardDrive, MoreHorizontal, RotateCcw, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import {
  bulkHardDeleteTrashDocsApi,
  bulkRestoreTrashDocsApi,
  hardDeleteDocApi,
  listTrashDocsApi,
  restoreDocApi,
  type DocSummary
} from "../../api/docs";
import "./trash.css";

const docs = ref<DocSummary[]>([]);
const loading = ref(false);
const operating = ref(false);
const removing = ref<DocSummary | null>(null);
const bulkRestoring = ref(false);
const bulkRemoving = ref(false);
const selectedIds = ref<number[]>([]);
const page = ref(1);
const hasMore = ref(false);

const selectedCount = computed(() => selectedIds.value.length);
const allSelected = computed(() => docs.value.length > 0 && selectedIds.value.length === docs.value.length);
const recoverableCount = computed(() => docs.value.length);
const releaseSize = computed(() => Math.max(0.42, docs.value.length * 0.047).toFixed(2));

async function load(options: { append?: boolean } = {}) {
  const nextPage = options.append ? page.value + 1 : 1;
  loading.value = true;
  try {
    const response = await listTrashDocsApi({ page: nextPage, pageSize: 30 });
    docs.value = options.append ? [...docs.value, ...response.docs] : response.docs;
    page.value = response.pagination?.page ?? nextPage;
    hasMore.value = response.pagination?.hasMore ?? false;
    selectedIds.value = selectedIds.value.filter((id) => docs.value.some((doc) => doc.id === id));
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  void load({ append: true });
}

function removeDocs(ids: number[]) {
  const idSet = new Set(ids);
  docs.value = docs.value.filter((doc) => !idSet.has(doc.id));
  selectedIds.value = selectedIds.value.filter((id) => !idSet.has(id));
}

function toggleSelection(id: number, checked: boolean) {
  selectedIds.value = checked
    ? Array.from(new Set([...selectedIds.value, id]))
    : selectedIds.value.filter((selectedId) => selectedId !== id);
}

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? docs.value.map((doc) => doc.id) : [];
}

async function restore(id: number) {
  operating.value = true;
  try {
  await restoreDocApi(id);
    removeDocs([id]);
  } finally {
    operating.value = false;
  }
}

async function bulkRestore() {
  if (!selectedIds.value.length) return;
  operating.value = true;
  try {
    const response = await bulkRestoreTrashDocsApi(selectedIds.value);
    removeDocs(response.restoredIds);
  } finally {
    bulkRestoring.value = false;
    operating.value = false;
  }
}

async function hardDelete() {
  if (!removing.value) return;
  operating.value = true;
  const id = removing.value.id;
  try {
    await hardDeleteDocApi(id);
    removeDocs([id]);
  } finally {
    removing.value = null;
    operating.value = false;
  }
}

async function bulkHardDelete() {
  if (!selectedIds.value.length) return;
  operating.value = true;
  try {
    const response = await bulkHardDeleteTrashDocsApi(selectedIds.value);
    removeDocs(response.deletedIds);
  } finally {
    bulkRemoving.value = false;
    operating.value = false;
  }
}

onMounted(load);

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
  <section class="trash-page">
    <div class="trash-page__head">
      <div>
        <h1>回收站 <span aria-hidden="true">✦</span></h1>
        <p>已删除的内容会暂存在这里，可随时恢复或永久删除。</p>
      </div>
      <div v-if="docs.length" class="trash-page__head-actions">
        <button class="cd-button" type="button" :disabled="!selectedCount || operating" @click="bulkRestoring = true">
          <RotateCcw :size="16" />批量恢复
        </button>
        <button class="cd-button danger" type="button" :disabled="!selectedCount || operating" @click="bulkRemoving = true">
          <Trash2 :size="16" />批量永久删除
        </button>
      </div>
    </div>

    <div class="trash-page__stats">
      <article><span><Archive :size="27" /></span><b>待清理文档</b><strong>{{ docs.length }}</strong><small>已占用存储空间</small></article>
      <article><span class="is-green"><RotateCcw :size="27" /></span><b>可恢复项目</b><strong>{{ recoverableCount }}</strong><small>可恢复文档和文件</small></article>
      <article><span><HardDrive :size="27" /></span><b>已释放空间潜力</b><strong>{{ releaseSize }} GB</strong><small>永久删除后可释放</small></article>
    </div>

    <div class="trash-page__layout">
      <main class="trash-page__main">
        <div class="trash-page__toolbar">
          <div class="trash-page__filters">
            <button class="is-active" type="button">全部</button>
            <button type="button">今天删除</button>
            <button type="button">7天内</button>
            <button type="button">30天内</button>
          </div>
          <div class="trash-page__sort">
            <button class="cd-button" type="button"><Clock :size="15" />按删除时间（最新）</button>
          </div>
        </div>

        <div v-if="loading" class="trash-page__skeleton">
          <span v-for="i in 4" :key="i" class="cd-skeleton" />
        </div>

        <div v-else-if="!docs.length" class="trash-page__empty cd-card">回收站为空</div>

        <div v-else class="trash-page__table">
          <div class="trash-page__bulkbar">
            <label class="trash-page__select">
              <input type="checkbox" :checked="allSelected" :disabled="operating" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
              <span>文档名称</span>
            </label>
            <span>原始位置</span>
            <span>删除时间</span>
            <span>保留剩余</span>
            <span>大小</span>
            <span>操作</span>
          </div>
          <div v-for="doc in docs" :key="doc.id" class="trash-page__row">
            <label class="trash-page__select" :aria-label="`选择 ${doc.title}`">
              <input
                type="checkbox"
                :checked="selectedIds.includes(doc.id)"
                :disabled="operating"
                @change="toggleSelection(doc.id, ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <div>
              <strong>{{ doc.title }}</strong>
              <span>/ 文档 / {{ doc.id }}</span>
            </div>
            <span>/个人/临时文件</span>
            <span>{{ formatDate(doc.deletedAt) }}</span>
            <span class="trash-page__pill">7天后清除</span>
            <span>0.95 MB</span>
            <div class="trash-page__actions">
              <button class="cd-button" type="button" :disabled="operating" @click="restore(doc.id)">
                <RotateCcw :size="16" />恢复
              </button>
              <button class="cd-button danger" type="button" :disabled="operating" @click="removing = doc">
                <Trash2 :size="16" />永久删除
              </button>
              <button type="button" aria-label="更多"><MoreHorizontal :size="16" /></button>
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
          <div class="trash-page__ring"><span>72%</span></div>
          <p>已用 21.6 GB / 30 GB</p>
          <button class="cd-button" type="button">查看存储详情</button>
        </section>
        <section>
          <strong>清理建议</strong>
          <p>及时恢复重要文件</p>
          <p>永久删除过期文件</p>
          <p>定期清理回收站</p>
        </section>
        <section>
          <strong>最近删除</strong>
          <article v-for="doc in docs.slice(0, 3)" :key="doc.id">
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
