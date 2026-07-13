<script setup lang="ts">
import { computed, type Component } from "vue";
import { Tag as TagIcon } from "lucide-vue-next";
import type { Tag } from "@/services/api";
import TagListItem from "./TagListItem.vue";

const props = defineProps<{
  loading: boolean;
  tags: Tag[];
  selected?: number[];
  editingId: number | null;
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

const selectedIds = computed(() => props.selected ?? []);
</script>

<template>
  <div v-if="loading" class="tag-manager__loading">
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
  </div>

  <div v-else class="tag-manager__list">
    <TagListItem
      v-for="tag in tags"
      :key="tag.id"
      :tag="tag"
      :selected="selectedIds.includes(tag.id)"
      :is-editing="editingId === tag.id"
      :edit-name="editName"
      :edit-color="editColor"
      :edit-icon="editIcon"
      :icon-map="iconMap"
      @select="$emit('select', $event)"
      @start-edit="$emit('startEdit', $event)"
      @delete="$emit('delete', $event)"
      @save-edit="$emit('saveEdit', $event)"
      @cancel-edit="$emit('cancelEdit')"
      @update:edit-name="$emit('update:editName', $event)"
      @update:edit-color="$emit('update:editColor', $event)"
      @update:edit-icon="$emit('update:editIcon', $event)"
    />

    <div v-if="tags.length === 0" class="empty-state">
      <TagIcon :size="32" :stroke-width="1.5" />
      <p>暂无标签</p>
    </div>
  </div>
</template>
