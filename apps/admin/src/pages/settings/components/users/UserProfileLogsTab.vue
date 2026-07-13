<script setup lang="ts">
import { computed } from "vue";
import { RefreshCw } from "lucide-vue-next";
import type { ManagedUserView, OperationLogView } from "@/services/api";

const props = defineProps<{
  mode: "login" | "actions";
  selectedUser: ManagedUserView;
  logs: OperationLogView[];
  logsLoading: boolean;
  formatLogDate: (value: string) => string;
  logActionText: (action: string) => string;
  logTargetText: (log: OperationLogView) => string;
}>();

defineEmits<{
  refreshLogs: [force: boolean];
}>();

const copy = computed(() => {
  if (props.mode === "login") {
    return {
      eyebrow: "登录日志",
      title: `${props.selectedUser.username} 的登录记录`,
      desc: "只显示当前用户的登录成功和登录失败事件。",
      refresh: "刷新日志",
      empty: "暂无登录记录"
    };
  }
  return {
    eyebrow: "操作记录",
    title: `${props.selectedUser.username} 的操作记录`,
    desc: "显示除登录外的文档、用户、系统配置等操作。",
    refresh: "刷新记录",
    empty: "暂无操作记录"
  };
});
</script>

<template>
  <section class="settings-page__tab-panel">
    <header class="settings-page__tab-panel-head">
      <div>
        <small>{{ copy.eyebrow }}</small>
        <h3>{{ copy.title }}</h3>
        <p>{{ copy.desc }}</p>
      </div>
      <button class="cd-button" type="button" :disabled="logsLoading" @click="$emit('refreshLogs', true)">
        <RefreshCw :size="16" />{{ logsLoading ? "刷新中" : copy.refresh }}
      </button>
    </header>
    <div class="settings-page__detail-log-table">
      <article v-for="log in logs" :key="log.id">
        <time>{{ formatLogDate(log.createdAt) }}</time>
        <span>{{ log.ip || selectedUser.lastIp || "--" }}</span>
        <strong :class="{ 'is-danger': mode === 'login' && log.action.includes('failure') }">{{ logActionText(log.action) }}</strong>
        <em>{{ logTargetText(log) }}</em>
      </article>
      <p v-if="!logs.length" class="settings-page__logs-empty">{{ copy.empty }}</p>
    </div>
  </section>
</template>
