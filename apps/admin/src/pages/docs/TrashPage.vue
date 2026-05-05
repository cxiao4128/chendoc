<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RotateCcw, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { hardDeleteDocApi, listTrashDocsApi, restoreDocApi, type DocSummary } from "../../api/docs";
import "./trash.css";

const docs = ref<DocSummary[]>([]);
const loading = ref(false);
const removing = ref<DocSummary | null>(null);

async function load() {
  loading.value = true;
  try {
    docs.value = (await listTrashDocsApi()).docs;
  } finally {
    loading.value = false;
  }
}

async function restore(id: number) {
  await restoreDocApi(id);
  await load();
}

async function hardDelete() {
  if (!removing.value) return;
  await hardDeleteDocApi(removing.value.id);
  removing.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <section class="trash-page">
    <div class="trash-page__head">
      <h1>回收站</h1>
      <p>软删除的文章会在这里保留，可恢复，也可以永久删除。</p>
    </div>

    <div v-if="loading" class="trash-page__skeleton">
      <span v-for="i in 4" :key="i" class="cd-skeleton" />
    </div>

    <div v-else-if="!docs.length" class="trash-page__empty cd-card">回收站为空</div>

    <div v-else class="trash-page__table">
      <div v-for="doc in docs" :key="doc.id" class="trash-page__row">
        <div>
          <strong>{{ doc.title }}</strong>
          <span>删除时间：{{ doc.deletedAt ? new Date(doc.deletedAt).toLocaleString() : "-" }}</span>
        </div>
        <button class="cd-button" type="button" @click="restore(doc.id)">
          <RotateCcw :size="16" />恢复
        </button>
        <button class="cd-button danger" type="button" @click="removing = doc">
          <Trash2 :size="16" />永久删除
        </button>
      </div>
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
  </section>
</template>
