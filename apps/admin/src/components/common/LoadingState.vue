<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

withDefaults(defineProps<{
  title?: string;
}>(), {
  title: "加载中"
});
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite">
    <Loader2 :size="22" class="loading-state__icon" />
    <span>{{ title }}</span>
  </div>
</template>

<style scoped>
.loading-state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 160px;
  color: var(--cd-muted);
  font-size: 14px;
}

.loading-state__icon {
  color: var(--cd-primary);
  animation: loading-state-spin 1s linear infinite;
}

@keyframes loading-state-spin {
  to { transform: rotate(360deg); }
}
</style>
