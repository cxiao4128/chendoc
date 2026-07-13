<script setup lang="ts">
import { AlertCircle } from "lucide-vue-next";

withDefaults(defineProps<{
  title?: string;
  description?: string;
}>(), {
  title: "加载失败",
  description: "请稍后重试"
});
</script>

<template>
  <div class="error-state" role="alert">
    <AlertCircle :size="24" />
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.error-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 160px;
  color: var(--cd-danger);
  text-align: center;
}

.error-state p {
  margin: 0;
  color: var(--cd-muted);
  font-size: 13px;
}
</style>
