<script setup lang="ts">
type StatsTab = "overview" | "recent";

defineProps<{
  days: number;
  activeTab: StatsTab;
}>();

defineEmits<{
  setDays: [value: number];
  setTab: [value: StatsTab];
}>();
</script>

<template>
  <div class="stats-panel__range">
    <button :class="{ active: days === 7 }" type="button" @click="$emit('setDays', 7)">7天</button>
    <button :class="{ active: days === 30 }" type="button" @click="$emit('setDays', 30)">30天</button>
    <button :class="{ active: days === 90 }" type="button" @click="$emit('setDays', 90)">90天</button>
  </div>

  <div class="stats-panel__tabs">
    <button :class="{ active: activeTab === 'overview' }" type="button" @click="$emit('setTab', 'overview')">概览</button>
    <button :class="{ active: activeTab === 'recent' }" type="button" @click="$emit('setTab', 'recent')">最近访问</button>
  </div>
</template>
