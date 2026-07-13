<script setup lang="ts">
import { ArrowUpDown, Grid3X3, ListFilter } from "lucide-vue-next";

const compactMode = defineModel<boolean>("compactMode", { required: true });

defineProps<{
  sortLabel: string;
}>();

defineEmits<{
  cycleSort: [];
  resetFilters: [];
}>();
</script>

<template>
  <div class="doc-list-page__table-tools">
    <button class="cd-button" type="button" @click="$emit('cycleSort')"><ArrowUpDown :size="15" />{{ sortLabel }}</button>
    <button class="cd-button" type="button" @click="$emit('resetFilters')"><ListFilter :size="15" />重置筛选</button>
    <button class="cd-button is-square" type="button" :class="{ 'is-active': compactMode }" aria-label="紧凑视图" @click="compactMode = !compactMode"><Grid3X3 :size="15" /></button>
  </div>
</template>
