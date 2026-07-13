<script setup lang="ts">
import { Highlighter, Palette } from "lucide-vue-next";
import type { CSSProperties } from "vue";
import type { ToolbarColorOption } from "./editor-toolbar-options";

defineProps<{
  kind: "text" | "highlight";
  open: boolean;
  current: string;
  dropdownStyle: CSSProperties;
  colors: ToolbarColorOption[];
}>();

const emit = defineEmits<{
  toggle: [event: MouseEvent];
  select: [color: string];
  custom: [color: string];
}>();

function handleCustom(event: Event) {
  emit("custom", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="editor-toolbar__color-picker">
    <button
      type="button"
      class="editor-toolbar__color-btn"
      :title="kind === 'text' ? '文本颜色' : '高亮背景'"
      :aria-label="kind === 'text' ? '文本颜色' : '高亮背景'"
      @click="emit('toggle', $event)"
    >
      <Palette v-if="kind === 'text'" :size="16" />
      <Highlighter v-else :size="16" />
      <span
        class="editor-toolbar__color-preview"
        :class="{ 'editor-toolbar__color-preview--highlight': kind === 'highlight' }"
        :style="{ backgroundColor: current || 'transparent' }"
      ></span>
    </button>
    <div v-show="open" class="editor-toolbar__color-dropdown" :style="dropdownStyle">
      <div class="editor-toolbar__color-label">{{ kind === 'text' ? '文本颜色' : '高亮背景' }}</div>
      <div class="editor-toolbar__color-grid">
        <button
          v-for="color in colors"
          :key="color.value"
          type="button"
          class="editor-toolbar__color-swatch color-picker__option"
          :class="{ active: current === color.value, 'is-reset': !color.value }"
          :style="color.value ? { backgroundColor: color.value } : {}"
          :title="color.name"
          :data-color="color.value"
          :aria-label="color.value ? `选择${kind === 'text' ? '文本颜色' : '高亮背景'} ${color.name}` : `清除${kind === 'text' ? '文本颜色' : '高亮背景'}`"
          @click="emit('select', color.value)"
        >
          <span v-if="!color.value">—</span>
        </button>
      </div>
      <div class="editor-toolbar__color-custom">
        <label>
          <span>自定义</span>
          <input type="color" :value="current" @input="handleCustom" />
        </label>
      </div>
    </div>
  </div>
</template>
