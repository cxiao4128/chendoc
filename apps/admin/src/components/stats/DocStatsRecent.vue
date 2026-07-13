<script setup lang="ts">
import type { AccessLog } from "@/services/api";

defineProps<{
  recentLogs: AccessLog[];
  formatDate: (value: string) => string;
  formatDevice: (device: string | undefined) => string;
  getDeviceColor: (device: string) => string;
}>();
</script>

<template>
  <div class="stats-panel__recent">
    <div v-if="recentLogs.length > 0" class="stats-logs">
      <div v-for="log in recentLogs" :key="log.id" class="stats-log">
        <div class="stats-log__info">
          <span class="stats-log__device" :style="{ backgroundColor: getDeviceColor(log.device || 'unknown') }">{{ formatDevice(log.device) }}</span>
          <span class="stats-log__time">{{ formatDate(log.viewedAt) }}</span>
        </div>
        <span class="stats-log__ua">{{ log.userAgent || "未知浏览器" }}</span>
      </div>
    </div>
    <div v-else class="stats-empty">暂无访问记录</div>
  </div>
</template>
