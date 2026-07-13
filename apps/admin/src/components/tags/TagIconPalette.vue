<script setup lang="ts">
import type { Component } from "vue";
import { X } from "lucide-vue-next";
import { TAG_ICONS } from "@/services/api";

defineProps<{
  modelValue: string;
  iconMap: Record<string, Component>;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="tag-manager__icons">
    <button
      v-for="iconName in TAG_ICONS"
      :key="iconName"
      class="tag-manager__icon"
      :class="{ active: modelValue === iconName }"
      type="button"
      :aria-label="iconName ? `选择图标 ${iconName}` : '不使用图标'"
      @click="$emit('update:modelValue', iconName)"
    >
      <component v-if="iconName && iconMap[iconName]" :is="iconMap[iconName]" :size="16" />
      <X v-else :size="16" />
    </button>
  </div>
</template>
