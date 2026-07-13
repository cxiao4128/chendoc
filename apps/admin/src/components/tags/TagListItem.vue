<script setup lang="ts">
import type { Component } from "vue";
import { Pencil, Trash2 } from "lucide-vue-next";
import type { Tag } from "@/services/api";
import TagColorPalette from "./TagColorPalette.vue";
import TagIconPalette from "./TagIconPalette.vue";

defineProps<{
  tag: Tag;
  selected: boolean;
  isEditing: boolean;
  editName: string;
  editColor: string;
  editIcon: string;
  iconMap: Record<string, Component>;
}>();

defineEmits<{
  select: [tag: Tag];
  startEdit: [tag: Tag];
  delete: [tag: Tag];
  saveEdit: [tag: Tag];
  cancelEdit: [];
  "update:editName": [value: string];
  "update:editColor": [value: string];
  "update:editIcon": [value: string];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="tag-manager__item" :class="{ selected }">
    <template v-if="isEditing">
      <input
        :value="editName"
        class="cd-input"
        placeholder="标签名称"
        maxlength="32"
        @input="$emit('update:editName', inputValue($event))"
        @keyup.enter="$emit('saveEdit', tag)"
        @keyup.esc="$emit('cancelEdit')"
      />
      <TagColorPalette :model-value="editColor" @update:model-value="$emit('update:editColor', $event)" />
      <TagIconPalette :model-value="editIcon" :icon-map="iconMap" @update:model-value="$emit('update:editIcon', $event)" />
      <button class="cd-button primary" type="button" @click="$emit('saveEdit', tag)">保存</button>
      <button class="cd-button" type="button" @click="$emit('cancelEdit')">取消</button>
    </template>

    <template v-else>
      <div class="tag-manager__tag" @click="$emit('select', tag)">
        <span class="tag-manager__icon-wrap" :style="{ color: tag.color }">
          <component v-if="tag.icon && iconMap[tag.icon]" :is="iconMap[tag.icon]" :size="14" />
        </span>
        <span class="tag-manager__dot" :style="{ backgroundColor: tag.color }" />
        <span class="tag-manager__name">{{ tag.name }}</span>
        <span class="tag-manager__count">{{ tag.docCount }}</span>
      </div>
      <div class="tag-manager__actions">
        <button class="tag-manager__action" type="button" title="编辑" @click.stop="$emit('startEdit', tag)">
          <Pencil :size="14" />
        </button>
        <button class="tag-manager__action danger" type="button" title="删除" @click.stop="$emit('delete', tag)">
          <Trash2 :size="14" />
        </button>
      </div>
    </template>
  </div>
</template>
