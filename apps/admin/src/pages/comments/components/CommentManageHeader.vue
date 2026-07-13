<script setup lang="ts">
import { MessageSquare } from "lucide-vue-next";

defineProps<{
  total: number;
}>();
</script>

<template>
  <header class="comment-manage__header">
    <div class="comment-manage__title">
      <MessageSquare :size="20" />
      <h1>评论管理</h1>
      <span class="cd-tag">{{ total }} 条评论</span>
    </div>
  </header>
</template>
