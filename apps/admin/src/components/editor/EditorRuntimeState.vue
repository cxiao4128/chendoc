<script setup lang="ts">
defineProps<{
  loadError: string;
  loading: boolean;
}>();
</script>

<template>
  <div v-if="loadError" class="chendoc-editor__runtime-state is-error">
    <strong>编辑器加载失败</strong>
    <span>{{ loadError }}</span>
  </div>
  <div v-else-if="loading" class="chendoc-editor__runtime-state" aria-label="编辑器加载中">
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
  </div>
</template>
