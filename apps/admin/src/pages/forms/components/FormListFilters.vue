<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import type { FormViewFilter } from "../../../features/forms";

const activeView = defineModel<FormViewFilter>({ required: true });

defineProps<{
  totalCount: number;
  publishedCount: number;
  draftCount: number;
  closedCount: number;
}>();

defineEmits<{
  create: [];
}>();
</script>

<template>
  <div class="doc-list-page__filter-tabs" role="tablist" aria-label="收集表视图">
    <button type="button" :class="{ 'is-active': activeView === 'all' }" role="tab" :aria-selected="activeView === 'all'" @click="activeView = 'all'">全部 <span>{{ totalCount }}</span></button>
    <button type="button" :class="{ 'is-active': activeView === 'published' }" role="tab" :aria-selected="activeView === 'published'" @click="activeView = 'published'">已发布 <span>{{ publishedCount }}</span></button>
    <button type="button" :class="{ 'is-active': activeView === 'draft' }" role="tab" :aria-selected="activeView === 'draft'" @click="activeView = 'draft'">草稿 <span>{{ draftCount }}</span></button>
    <button type="button" :class="{ 'is-active': activeView === 'closed' }" role="tab" :aria-selected="activeView === 'closed'" @click="activeView = 'closed'">已关闭 <span>{{ closedCount }}</span></button>
    <button type="button" aria-label="新建表单" @click="$emit('create')"><Plus :size="15" /></button>
  </div>
</template>
