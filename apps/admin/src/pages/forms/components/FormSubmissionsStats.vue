<script setup lang="ts">
defineProps<{
  submissionCount: number;
  viewCount: number;
  sourceCount: number;
}>();
</script>

<template>
  <div class="stats-cards">
    <div class="stat-card">
      <div class="stat-value">{{ submissionCount }}</div>
      <div class="stat-label">提交数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{{ viewCount }}</div>
      <div class="stat-label">访问数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{{ sourceCount }}</div>
      <div class="stat-label">来源数</div>
    </div>
  </div>
</template>
