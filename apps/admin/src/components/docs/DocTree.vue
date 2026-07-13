<script setup lang="ts">
import { FileText, Plus } from "lucide-vue-next";
import type { DocSummary } from "@/services/api";
import { sharePathOf } from "../../utils/sharePath";
import "./doc-tree.css";

defineProps<{
  docs: DocSummary[];
  activeUid?: string | null;
  loading?: boolean;
}>();
defineEmits<{ create: []; select: [docUid: string] }>();

function sharePath(doc: DocSummary) {
  return sharePathOf(doc);
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
      :key="doc.docUid"
      class="doc-tree__item"
      :class="{ active: activeUid === doc.docUid }"
      type="button"
      @click="$emit('select', doc.docUid)"
    >
      <FileText :size="16" />
      <span>{{ doc.title }}</span>
      <small v-if="sharePath(doc)">{{ sharePath(doc) }}</small>
    </button>
  </aside>
</template>
