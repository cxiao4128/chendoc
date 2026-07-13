<script setup lang="ts">
import { BarChart2, Copy, FileText, Link, MoreHorizontal, Plus, RefreshCw } from "lucide-vue-next";
import EmptyState from "../../../components/common/EmptyState.vue";
import {
  formatFormListDate,
  formStatusLabel,
  type FormItem
} from "../../../features/forms";

defineProps<{
  loading: boolean;
  errorText: string;
  visibleForms: FormItem[];
  compactMode: boolean;
  selectedFormIds: Set<number>;
  bulkMode: boolean;
  copiedUid: string | null;
}>();

defineEmits<{
  retryLoad: [];
  create: [];
  openOrToggle: [id: number];
  toggleSelection: [id: number];
  edit: [id: number];
  viewSubmissions: [id: number];
  copyLink: [form: FormItem];
}>();
</script>

<template>
  <div v-if="loading" class="doc-list-page__skeleton">
    <span v-for="i in 6" :key="i" class="cd-skeleton" />
  </div>

  <div v-else-if="errorText" class="doc-list-page__error">
    <strong>收集表加载失败</strong>
    <p>{{ errorText }}</p>
    <button class="cd-button primary" type="button" @click="$emit('retryLoad')"><RefreshCw :size="16" />重试</button>
  </div>

  <EmptyState v-else-if="!visibleForms.length" title="没有收集表">
    <button class="cd-button primary" type="button" @click="$emit('create')"><Plus :size="16" />新建表单</button>
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
      @click="$emit('openOrToggle', form.id)"
      @keydown="(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $emit('openOrToggle', form.id); } }"
    >
      <label class="doc-list-page__select" @click.stop>
        <input :checked="selectedFormIds.has(form.id)" type="checkbox" @change="$emit('toggleSelection', form.id)" />
        <span></span>
      </label>
      <span class="doc-list-page__row-title">
        <i><FileText :size="17" /></i>
        <strong>{{ form.title }}</strong>
        <small v-if="form.description">{{ form.description }}</small>
        <small v-else>/ {{ form.formUid }}</small>
      </span>
      <span :class="`status-${form.status}`">{{ formStatusLabel(form.status) }}</span>
      <span>{{ formatFormListDate(form.updatedAt) }}</span>
      <code>{{ form.viewCount }} 访问 · {{ form.submissionCount }} 提交</code>
      <span class="doc-list-page__ops" @click.stop>
        <button type="button" aria-label="编辑" @click="$emit('edit', form.id)"><MoreHorizontal :size="17" /></button>
        <button type="button" aria-label="查看结果" @click="$emit('viewSubmissions', form.id)"><BarChart2 :size="16" /></button>
        <button type="button" :disabled="form.status !== 'published'" :aria-label="form.status === 'published' ? (copiedUid === form.formUid ? '已复制' : '复制公开链接') : '发布后可复制链接'" @click="$emit('copyLink', form)">
          <span v-if="copiedUid === form.formUid"><Copy :size="16" />已复制</span>
          <Link v-else :size="16" />
        </button>
      </span>
    </article>
  </div>
</template>
