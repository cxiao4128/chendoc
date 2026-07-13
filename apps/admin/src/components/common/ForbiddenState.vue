<script setup lang="ts">
import { ShieldAlert } from "lucide-vue-next";

withDefaults(defineProps<{
  title?: string;
  description?: string;
}>(), {
  title: "无权访问",
  description: "当前账号没有这个操作权限"
});
</script>

<template>
  <div class="forbidden-state">
    <ShieldAlert :size="24" />
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
  </div>
</template>

<style scoped>
.forbidden-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 160px;
  color: var(--cd-muted);
  text-align: center;
}

.forbidden-state strong {
  color: var(--cd-text);
}

.forbidden-state p {
  margin: 0;
  font-size: 13px;
}
</style>
