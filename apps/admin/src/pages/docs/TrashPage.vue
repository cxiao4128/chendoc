<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RotateCcw, Trash2 } from "lucide-vue-next";
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
</script>

<template>
  <section class="trash-page">
    <div class="trash-page__head">
      <div>
        <h1>回收站</h1>
        <p>软删除的文章会在这里保留，可恢复，也可以永久删除。</p>
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

    <div v-if="loading" class="trash-page__skeleton">
      <span v-for="i in 4" :key="i" class="cd-skeleton" />
    </div>

    <div v-else-if="!docs.length" class="trash-page__empty cd-card">回收站为空</div>

    <div v-else class="trash-page__table">
      <div class="trash-page__bulkbar">
        <label class="trash-page__select">
          <input type="checkbox" :checked="allSelected" :disabled="operating" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
          <span>已选 {{ selectedCount }} / {{ docs.length }}</span>
        </label>
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
          <span>删除时间：{{ doc.deletedAt ? new Date(doc.deletedAt).toLocaleString() : "-" }}</span>
        </div>
        <button class="cd-button" type="button" :disabled="operating" @click="restore(doc.id)">
          <RotateCcw :size="16" />恢复
        </button>
        <button class="cd-button danger" type="button" :disabled="operating" @click="removing = doc">
          <Trash2 :size="16" />永久删除
        </button>
      </div>
      <button v-if="hasMore" class="cd-button trash-page__more" type="button" :disabled="loading" @click="loadMore">
        {{ loading ? "加载中..." : "加载更多" }}
      </button>
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
