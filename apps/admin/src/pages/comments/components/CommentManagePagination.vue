<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

defineProps<{
  currentPage: number;
  totalPages: number;
  total: number;
  pageNumbers: number[];
}>();

defineEmits<{
  previous: [];
  next: [];
  goToPage: [page: number];
}>();
</script>

<template>
  <div v-if="totalPages > 1" class="comment-manage__pagination">
    <span class="comment-manage__pagination-info">
      第 {{ currentPage }} / {{ totalPages }} 页，共 {{ total }} 条
    </span>
    <div class="cd-pagination">
      <button
        class="cd-button ghost"
        type="button"
        :disabled="currentPage <= 1"
        @click="$emit('previous')"
      >
        <ChevronLeft :size="16" />
      </button>
      <template v-for="page in pageNumbers" :key="page">
        <button
          class="cd-button"
          :class="{ primary: page === currentPage }"
          type="button"
          @click="$emit('goToPage', page)"
        >
          {{ page }}
        </button>
      </template>
      <button
        class="cd-button ghost"
        type="button"
        :disabled="currentPage >= totalPages"
        @click="$emit('next')"
      >
        <ChevronRight :size="16" />
      </button>
    </div>
  </div>
</template>
