<script setup lang="ts">
import { FileText } from "lucide-vue-next";
import "./empty-state.css";

defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <FileText :size="24" />
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
