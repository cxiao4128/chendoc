<script setup lang="ts">
import { computed } from "vue";
import type { FieldCategories, FieldType, FormField } from "../../../features/forms";
import FieldInspector from "./FieldInspector.vue";
import FieldPalette from "./FieldPalette.vue";
import FormCanvas from "./FormCanvas.vue";

defineProps<{
  filteredCategories: FieldCategories;
  draggingIndex: number | null;
}>();

const title = defineModel<string>("title", { required: true });
const description = defineModel<string>("description", { required: true });
const fields = defineModel<FormField[]>("fields", { required: true });
const selectedFieldId = defineModel<string | null>("selectedFieldId", { required: true });
const searchQuery = defineModel<string>("searchQuery", { required: true });
const mobileEditStep = defineModel<"fields" | "settings" | "preview">("mobileEditStep", { required: true });
const mobileFieldPickerOpen = defineModel<boolean>("mobileFieldPickerOpen", { required: true });

defineEmits<{
  addField: [type: FieldType, name?: string];
  selectField: [id: string];
  deleteField: [id: string];
  moveField: [index: number, direction: "up" | "down"];
  dragStart: [index: number];
  dragOver: [event: DragEvent, index: number];
  drop: [event: DragEvent, index: number];
  dragEnd: [];
  addOption: [];
  removeOption: [index: number];
}>();

const selectedField = computed(() => fields.value.find((field) => field.id === selectedFieldId.value) || null);
</script>

<template>
  <div class="form-body">
    <nav class="form-editor-mobile-steps" aria-label="手机端表单编辑步骤">
      <button type="button" :class="{ active: mobileEditStep === 'fields' }" @click="mobileEditStep = 'fields'">字段列表</button>
      <button type="button" :class="{ active: mobileEditStep === 'settings' }" :disabled="!selectedField" @click="mobileEditStep = 'settings'">字段设置</button>
      <button type="button" :class="{ active: mobileEditStep === 'preview' }" @click="mobileEditStep = 'preview'">预览</button>
    </nav>

    <FieldPalette
      v-model:search-query="searchQuery"
      v-model:mobile-field-picker-open="mobileFieldPickerOpen"
      :filtered-categories="filteredCategories"
      @add-field="(type, name) => $emit('addField', type, name)"
    />

    <FormCanvas
      v-model:title="title"
      v-model:description="description"
      v-model:fields="fields"
      v-model:selected-field-id="selectedFieldId"
      v-model:mobile-edit-step="mobileEditStep"
      v-model:mobile-field-picker-open="mobileFieldPickerOpen"
      :dragging-index="draggingIndex"
      @select-field="$emit('selectField', $event)"
      @delete-field="$emit('deleteField', $event)"
      @move-field="(index, direction) => $emit('moveField', index, direction)"
      @drag-start="$emit('dragStart', $event)"
      @drag-over="(event, index) => $emit('dragOver', event, index)"
      @drop="(event, index) => $emit('drop', event, index)"
      @drag-end="$emit('dragEnd')"
    />

    <FieldInspector
      v-model:fields="fields"
      v-model:selected-field-id="selectedFieldId"
      v-model:mobile-edit-step="mobileEditStep"
      @add-option="$emit('addOption')"
      @remove-option="$emit('removeOption', $event)"
    />
  </div>
</template>
