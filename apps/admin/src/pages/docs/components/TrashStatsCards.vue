<script setup lang="ts">
import { Archive, HardDrive, RotateCcw } from "lucide-vue-next";

defineProps<{
  count: number;
  recoverableCount: number;
  releaseSize: number;
}>();
</script>

<template>
  <div class="trash-page__stats">
    <article><span><Archive :size="27" /></span><b>待清理文档</b><strong>{{ count }}</strong><small>筛选后数量</small></article>
    <article><span class="is-green"><RotateCcw :size="27" /></span><b>可恢复项目</b><strong>{{ recoverableCount }}</strong><small>可恢复文档和文件</small></article>
    <article><span><HardDrive :size="27" /></span><b>已释放空间潜力</b><strong>{{ releaseSize }} GB</strong><small>永久删除后可释放</small></article>
  </div>
</template>
