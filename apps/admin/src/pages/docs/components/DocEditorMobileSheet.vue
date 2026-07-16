<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { useVisualViewportInset } from "../../../components/editor/useVisualViewportInset";

export type MobilePagePanel = "share" | "more" | null;

const props = defineProps<{
  panel: MobilePagePanel;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
const { keyboardInsetStyle } = useVisualViewportInset();
let previousFocus: HTMLElement | null = null;

function focusableElements() {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) ?? []);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const controls = focusableElements();
  if (!controls.length) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.panel, async (panel, previousPanel) => {
  if (!panel) {
    previousFocus?.focus();
    previousFocus = null;
    return;
  }
  if (!previousPanel) previousFocus = document.activeElement as HTMLElement | null;
  await nextTick();
  focusableElements()[0]?.focus();
});

onBeforeUnmount(() => previousFocus?.focus());
</script>

<template>
  <Teleport to="body">
    <Transition name="mobile-sheet-fade">
      <button
        v-if="panel"
        class="doc-editor-page__mobile-sheet-scrim"
        type="button"
        aria-label="关闭面板"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="mobile-sheet-up">
      <aside
        v-if="panel"
        ref="dialog"
        class="doc-editor-page__mobile-sheet"
        :style="keyboardInsetStyle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-editor-mobile-sheet-title"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="doc-editor-page__mobile-sheet-handle" />
        <header class="doc-editor-page__mobile-sheet-head">
          <div>
            <strong id="doc-editor-mobile-sheet-title">{{ panel === "share" ? "分享设置" : "更多操作" }}</strong>
            <small>{{ title || "未命名文档" }}</small>
          </div>
          <button type="button" aria-label="关闭面板" @click="emit('close')"><X :size="20" /></button>
        </header>
        <div class="doc-editor-page__mobile-sheet-content">
          <slot :name="panel" />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
