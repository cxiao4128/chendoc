<script setup lang="ts">
import { ArrowLeft, Download, RefreshCw, Trash2 } from "lucide-vue-next";
import type { FormExportFormat } from "../../../features/forms";

defineProps<{
  title: string;
  loading: boolean;
  deleting: boolean;
  exporting: boolean;
  submissionCount: number;
}>();

defineEmits<{
  back: [];
  refresh: [];
  deleteAll: [];
  exportData: [format: FormExportFormat];
}>();
</script>

<template>
  <header class="page-header">
    <div class="header-left">
      <button class="icon-btn" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <h1>{{ title }}</h1>
    </div>
    <div class="header-actions">
      <button class="cd-button" :disabled="loading" @click="$emit('refresh')">
        <RefreshCw :size="16" :class="{ spinning: loading }" /> 刷新
      </button>
      <button class="cd-button danger" :disabled="deleting || !submissionCount" @click="$emit('deleteAll')">
        <Trash2 :size="16" /> 删除全部数据
      </button>
      <div class="export-dropdown">
        <button class="cd-button cd-button-primary" :disabled="exporting">
          <Download :size="16" /> 导出
        </button>
        <div class="export-menu">
          <button @click="$emit('exportData', 'csv')">导出 CSV</button>
          <button @click="$emit('exportData', 'json')">导出 JSON</button>
          <button @click="$emit('exportData', 'xlsx')">导出 Excel</button>
        </div>
      </div>
    </div>
  </header>
</template>
