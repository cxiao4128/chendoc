<script setup lang="ts">
/**
 * DocEditorCanvas.vue - 编辑器画布封装
 *
 * 职责：
 * - 编辑器懒加载
 * - 编辑器 props 传递
 * - TOC 事件处理
 */
import { computed, defineAsyncComponent } from "vue";
import type { DocDetail } from "../../../api/docs";

const EditorLoadingSkeleton = {
  name: "EditorLoadingSkeleton",
  setup() {
    return () => ({
      type: "div" as const,
      props: { class: "doc-editor-canvas__skeleton", "aria-label": "编辑器加载中" },
      children: [
        { type: "span" as const, props: { class: "cd-skeleton" } },
        { type: "span" as const, props: { class: "cd-skeleton" } },
        { type: "span" as const, props: { class: "cd-skeleton" } }
      ]
    });
  }
};

const ChendocEditor = defineAsyncComponent({
  loader: () => import("../../../components/editor/ChendocEditor.vue"),
  loadingComponent: EditorLoadingSkeleton,
  delay: 120
});

const props = defineProps<{
  docUid: string;
  contentJson: string;
  editorKey: string;
}>();

const emit = defineEmits<{
  (e: "change", payload: { contentJson: string; textLength: number }): void;
  (e: "toc", toc: Array<{ id: string; text: string; level: 1 | 2 | 3 }>): void;
}>();
</script>

<template>
  <div class="doc-editor-canvas">
    <ChendocEditor
      :key="editorKey"
      :doc-uid="docUid"
      :content-json="contentJson"
      @change="(payload: { contentJson: string; textLength: number }) => emit('change', payload)"
      @toc="(toc: Array<{ id: string; text: string; level: 1 | 2 | 3 }>) => emit('toc', toc)"
    />
  </div>
</template>

<style scoped>
.doc-editor-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cd-bg, #fff);
}

.doc-editor-canvas__skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.doc-editor-canvas__skeleton .cd-skeleton {
  height: 20px;
  border-radius: 4px;
}

.doc-editor-canvas__skeleton .cd-skeleton:nth-child(1) {
  width: 60%;
}

.doc-editor-canvas__skeleton .cd-skeleton:nth-child(2) {
  width: 80%;
}

.doc-editor-canvas__skeleton .cd-skeleton:nth-child(3) {
  width: 45%;
}
</style>