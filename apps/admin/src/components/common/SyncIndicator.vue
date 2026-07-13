<script setup lang="ts">
import { computed } from "vue";
import { Cloud, CloudOff, RefreshCw } from "lucide-vue-next";
import type { SyncState } from "../../composables/useSyncState";

const props = defineProps<{
  state: SyncState;
  showText?: boolean;
}>();

const stateClass = computed(() => `sync-indicator--${props.state}`);

const stateIcon = computed(() => {
  switch (props.state) {
    case "synced":
      return Cloud;
    case "syncing":
      return RefreshCw;
    case "pending":
      return Cloud;
    case "offline":
      return CloudOff;
    case "error":
      return CloudOff;
    default:
      return Cloud;
  }
});
</script>

<template>
  <span
    class="sync-indicator"
    :class="stateClass"
    :title="state === 'synced' ? '已同步到云端' : state === 'offline' ? '离线模式，内容已保存本地' : state === 'error' ? '同步失败，请检查网络' : '正在同步...'"
  >
    <component :is="stateIcon" :size="14" :class="{ 'is-spinning': state === 'syncing' }" />
    <span v-if="showText && state !== 'synced'" class="sync-indicator__text">{{
      state === 'syncing' ? '同步中' :
      state === 'pending' ? '待同步' :
      state === 'offline' ? '离线' :
      state === 'error' ? '失败' : ''
    }}</span>
  </span>
</template>

<style scoped>
.sync-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--cd-text-muted, #999);
  transition: color 0.2s, background-color 0.2s;
}

.sync-indicator--synced {
  color: var(--cd-color-success, #34c759);
}

.sync-indicator--syncing {
  color: var(--cd-text-muted, #999);
}

.sync-indicator--pending {
  color: var(--cd-text-muted, #999);
}

.sync-indicator--offline {
  color: var(--cd-color-warning, #ff9500);
}

.sync-indicator--error {
  color: var(--cd-color-danger, #ff3b30);
}

.sync-indicator :deep(.is-spinning) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.sync-indicator__text {
  line-height: 1;
}
</style>