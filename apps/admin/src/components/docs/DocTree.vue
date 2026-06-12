<script setup lang="ts">
import { FileText, Plus } from "lucide-vue-next";
import type { DocSummary } from "../../api/docs";
import "./doc-tree.css";

defineProps<{
  docs: DocSummary[];
  activeId?: number | null;
  loading?: boolean;
}>();
defineEmits<{ create: []; select: [id: number] }>();

function sharePath(doc: DocSummary) {
  return doc.shareCode ? `/r/${doc.shareCode}` : "";
}
</script>

<template>
  <aside class="doc-tree">
    <div class="doc-tree__head">
      <strong>文档资产</strong>
      <button type="button" aria-label="新建文档" @click="$emit('create')">
        <Plus :size="16" />
      </button>
    </div>
    <div v-if="loading" class="doc-tree__loading">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>
    <button
      v-for="doc in docs"
      v-else
      :key="doc.id"
      class="doc-tree__item"
      :class="{ active: activeId === doc.id }"
      type="button"
      @click="$emit('select', doc.id)"
    >
      <FileText :size="16" />
      <span>{{ doc.title }}</span>
      <small v-if="sharePath(doc)">{{ sharePath(doc) }}</small>
    </button>
  </aside>
</template>
