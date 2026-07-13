<script setup lang="ts">
import { X } from "lucide-vue-next";

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="stats-panel__header">
    <h2>访问统计</h2>
    <button class="stats-panel__close" type="button" aria-label="关闭访问统计" @click="$emit('close')">
      <X :size="20" />
    </button>
  </div>
</template>
