<script setup lang="ts">
import type { Component } from "vue";
import TagColorPalette from "./TagColorPalette.vue";
import TagIconPalette from "./TagIconPalette.vue";

defineProps<{
  name: string;
  color: string;
  icon: string;
  iconMap: Record<string, Component>;
}>();

defineEmits<{
  "update:name": [value: string];
  "update:color": [value: string];
  "update:icon": [value: string];
  create: [];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="tag-manager__create">
    <input
      :value="name"
      class="cd-input"
      placeholder="标签名称"
      maxlength="32"
      @input="$emit('update:name', inputValue($event))"
      @keyup.enter="$emit('create')"
    />
    <div class="tag-manager__section-label">颜色</div>
    <TagColorPalette :model-value="color" @update:model-value="$emit('update:color', $event)" />
    <div class="tag-manager__section-label">图标</div>
    <TagIconPalette :model-value="icon" :icon-map="iconMap" @update:model-value="$emit('update:icon', $event)" />
    <button class="cd-button primary" type="button" @click="$emit('create')">创建</button>
  </div>
</template>
