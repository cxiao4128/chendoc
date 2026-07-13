<script setup lang="ts">
import { RotateCcw, Trash2 } from "lucide-vue-next";
import type { DocSummary } from "@/services/api";

defineProps<{
  docs: DocSummary[];
  loading: boolean;
  hasMore: boolean;
  allSelected: boolean;
  selectedDocUids: string[];
  operating: boolean;
  formatDate: (value?: string | null) => string;
  getRetentionDaysLeft: (value?: string | null) => number;
  getRetentionText: (value?: string | null) => string;
}>();

const emit = defineEmits<{
  toggleAll: [checked: boolean];
  toggleSelection: [docUid: string, checked: boolean];
  restore: [docUid: string];
  requestRemove: [doc: DocSummary];
  loadMore: [];
}>();
</script>

<template>
  <div v-if="loading" class="trash-page__skeleton">
    <span v-for="i in 4" :key="i" class="cd-skeleton" />
  </div>

  <div v-else-if="!docs.length" class="trash-page__empty cd-card">
    <p>筛选范围内没有文档</p>
  </div>

  <div v-else class="trash-page__table">
    <div class="trash-page__bulkbar">
      <label class="trash-page__select">
        <input type="checkbox" :checked="allSelected" :disabled="operating" @change="emit('toggleAll', ($event.target as HTMLInputElement).checked)" />
        <span>文档名称</span>
      </label>
      <span>所有者</span>
      <span>删除时间</span>
      <span>保留剩余</span>
      <span>删除者</span>
      <span>操作</span>
    </div>
    <div v-for="doc in docs" :key="doc.docUid" class="trash-page__row">
      <label class="trash-page__select" :aria-label="`选择 ${doc.title}`">
        <input
          type="checkbox"
          :checked="selectedDocUids.includes(doc.docUid)"
          :disabled="operating"
          @change="emit('toggleSelection', doc.docUid, ($event.target as HTMLInputElement).checked)"
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
        <button class="cd-button" type="button" :disabled="operating" @click="emit('restore', doc.docUid)">
          <RotateCcw :size="16" />恢复
        </button>
        <button class="cd-button danger" type="button" :disabled="operating" @click="emit('requestRemove', doc)">
          <Trash2 :size="16" />永久删除
        </button>
      </div>
    </div>
    <button v-if="hasMore" class="cd-button trash-page__more" type="button" :disabled="loading" @click="emit('loadMore')">
      {{ loading ? "加载中..." : "加载更多" }}
    </button>
  </div>
</template>
