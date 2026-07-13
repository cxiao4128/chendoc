<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";
import type { OperationLogView } from "@/services/api";

defineProps<{
  operationLogs: OperationLogView[];
  logsLoading: boolean;
  formatLogDate: (value: string) => string;
  logActionText: (action: string) => string;
  logTargetText: (log: OperationLogView) => string;
  logActorText: (log: OperationLogView) => string;
}>();

defineEmits<{
  refresh: [];
}>();
</script>

<template>
  <section class="settings-page__panel">
    <div class="settings-page__panel-head">
      <div>
        <small>最近 80 条</small>
        <h2>操作日志</h2>
      </div>
      <button class="cd-button" type="button" :disabled="logsLoading" @click="$emit('refresh')">
        <RefreshCw :size="16" />{{ logsLoading ? "刷新中" : "刷新" }}
      </button>
    </div>
    <div v-if="logsLoading" class="settings-page__logs-empty">加载中...</div>
    <div v-else-if="!operationLogs.length" class="settings-page__logs-empty">暂无操作记录</div>
    <div v-else class="settings-page__log-table">
      <article v-for="log in operationLogs" :key="log.id" class="settings-page__log-row">
        <time>{{ formatLogDate(log.createdAt) }}</time>
        <strong>{{ logActionText(log.action) }}</strong>
        <span>{{ logActorText(log) }}</span>
        <code>{{ logTargetText(log) }}</code>
      </article>
    </div>
  </section>
</template>
