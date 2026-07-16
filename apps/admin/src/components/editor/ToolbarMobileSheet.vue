<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Bold, CheckSquare, Code2, FileUp, Heading1, Heading2, Heading3, Highlighter,
  ImagePlus, Italic, Link, List, ListOrdered, Minus, Palette, Quote, Strikethrough,
  Table2, Underline, Video, X
} from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import type { EditorStylePatch, MobileToolbarSheet } from "./editor-types";
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "./editor-toolbar-options";
import { isTextEditingElement } from "./useVisualViewportInset";

const props = defineProps<{
  sheet: MobileToolbarSheet | null;
  editor: Editor | null;
  keyboardInset: number;
}>();

const emit = defineEmits<{
  close: [];
  uploadImage: [];
  uploadVideo: [];
  uploadAttachment: [];
  promptForLink: [];
  insertTable: [];
  setTextColor: [color: string];
  setHighlight: [color: string];
  styleChange: [patch: EditorStylePatch];
}>();

const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
let restoreFocusOnClose = true;

const titles: Record<MobileToolbarSheet, string> = {
  format: "文字格式",
  list: "列表与引用",
  insert: "插入内容"
};

function closeSheet(restoreFocus: boolean) {
  restoreFocusOnClose = restoreFocus;
  emit("close");
}

function run(command: () => void) {
  command();
  closeSheet(false);
}

function focusableElements() {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) ?? []);
}

function preserveEditorFocus(event: PointerEvent) {
  if (isTextEditingElement(previousFocus) && (event.target as Element).closest("button")) {
    event.preventDefault();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet(true);
    return;
  }
  if (event.key !== "Tab") return;
  const controls = focusableElements();
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setHeading(level?: 1 | 2 | 3) {
  run(() => {
    const editor = props.editor;
    if (!editor) return;
    if (level) editor.chain().focus().toggleHeading({ level }).run();
    else editor.chain().focus().setParagraph().run();
  });
}

function valueFromSelect(event: Event) {
  emit("styleChange", { fontSize: (event.target as HTMLSelectElement).value });
  props.editor?.chain().focus().run();
}

watch(() => props.sheet, async (sheet, previousSheet) => {
  if (!sheet) {
    if (restoreFocusOnClose) previousFocus?.focus();
    previousFocus = null;
    restoreFocusOnClose = true;
    return;
  }
  if (!previousSheet) {
    previousFocus = document.activeElement as HTMLElement | null;
    restoreFocusOnClose = true;
  }
  await nextTick();
  if (!isTextEditingElement(previousFocus)) focusableElements()[0]?.focus();
});

onBeforeUnmount(() => {
  if (restoreFocusOnClose) previousFocus?.focus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="toolbar-sheet-fade">
      <button v-if="sheet" class="editor-toolbar__sheet-scrim" type="button" aria-label="关闭工具面板" @click="closeSheet(true)" />
    </Transition>
    <Transition name="toolbar-sheet-up">
      <aside
        v-if="sheet"
        ref="dialog"
        class="editor-toolbar__sheet"
        :style="{ bottom: `${keyboardInset}px` }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-toolbar-sheet-title"
        tabindex="-1"
        @keydown="onKeydown"
        @pointerdown="preserveEditorFocus"
      >
        <header class="editor-toolbar__sheet-head">
          <strong id="editor-toolbar-sheet-title">{{ titles[sheet] }}</strong>
          <button type="button" aria-label="关闭工具面板" @click="closeSheet(true)"><X :size="20" /></button>
        </header>

        <div v-if="sheet === 'format'" class="editor-toolbar__sheet-body">
          <div class="editor-toolbar__sheet-grid is-four">
            <button type="button" @click="setHeading()"><span>正文</span></button>
            <button type="button" :class="{ active: editor?.isActive('heading', { level: 1 }) }" @click="setHeading(1)"><Heading1 :size="20" /><span>标题1</span></button>
            <button type="button" :class="{ active: editor?.isActive('heading', { level: 2 }) }" @click="setHeading(2)"><Heading2 :size="20" /><span>标题2</span></button>
            <button type="button" :class="{ active: editor?.isActive('heading', { level: 3 }) }" @click="setHeading(3)"><Heading3 :size="20" /><span>标题3</span></button>
            <button type="button" :class="{ active: editor?.isActive('bold') }" @click="run(() => editor?.chain().focus().toggleBold().run())"><Bold :size="20" /><span>粗体</span></button>
            <button type="button" :class="{ active: editor?.isActive('italic') }" @click="run(() => editor?.chain().focus().toggleItalic().run())"><Italic :size="20" /><span>斜体</span></button>
            <button type="button" :class="{ active: editor?.isActive('underline') }" @click="run(() => editor?.chain().focus().toggleUnderline().run())"><Underline :size="20" /><span>下划线</span></button>
            <button type="button" :class="{ active: editor?.isActive('strike') }" @click="run(() => editor?.chain().focus().toggleStrike().run())"><Strikethrough :size="20" /><span>删除线</span></button>
          </div>
          <label class="editor-toolbar__sheet-select"><span>字号</span><select @change="valueFromSelect"><option value="16px">16</option><option value="15px">15</option><option value="18px">18</option><option value="20px">20</option></select></label>
          <div class="editor-toolbar__palette"><span><Palette :size="16" />文字颜色</span><div><button v-for="color in TEXT_COLORS" :key="`text-${color.value}`" type="button" :aria-label="color.value ? `文字颜色${color.name}` : '清除文字颜色'" :class="{ 'is-reset': !color.value }" :style="color.value ? { backgroundColor: color.value } : {}" @click="run(() => emit('setTextColor', color.value))">{{ color.value ? '' : '×' }}</button></div></div>
          <div class="editor-toolbar__palette"><span><Highlighter :size="16" />高亮</span><div><button v-for="color in HIGHLIGHT_COLORS" :key="`highlight-${color.value}`" type="button" :aria-label="color.value ? `高亮${color.name}` : '清除高亮'" :class="{ 'is-reset': !color.value }" :style="color.value ? { backgroundColor: color.value } : {}" @click="run(() => emit('setHighlight', color.value))">{{ color.value ? '' : '×' }}</button></div></div>
        </div>

        <div v-else-if="sheet === 'list'" class="editor-toolbar__sheet-body">
          <div class="editor-toolbar__sheet-grid">
            <button type="button" :class="{ active: editor?.isActive('bulletList') }" @click="run(() => editor?.chain().focus().toggleBulletList().run())"><List :size="21" /><span>无序列表</span></button>
            <button type="button" :class="{ active: editor?.isActive('orderedList') }" @click="run(() => editor?.chain().focus().toggleOrderedList().run())"><ListOrdered :size="21" /><span>有序列表</span></button>
            <button type="button" :class="{ active: editor?.isActive('taskList') }" @click="run(() => editor?.chain().focus().toggleTaskList().run())"><CheckSquare :size="21" /><span>待办列表</span></button>
            <button type="button" :class="{ active: editor?.isActive('blockquote') }" @click="run(() => editor?.chain().focus().toggleBlockquote().run())"><Quote :size="21" /><span>引用</span></button>
          </div>
        </div>

        <div v-else class="editor-toolbar__sheet-body">
          <div class="editor-toolbar__sheet-grid">
            <button type="button" @click="run(() => emit('uploadImage'))"><ImagePlus :size="21" /><span>图片</span></button>
            <button type="button" @click="run(() => emit('uploadVideo'))"><Video :size="21" /><span>视频</span></button>
            <button type="button" data-testid="mobile-upload-attachment" @click="run(() => emit('uploadAttachment'))"><FileUp :size="21" /><span>附件</span></button>
            <button type="button" @click="run(() => emit('promptForLink'))"><Link :size="21" /><span>链接</span></button>
            <button type="button" @click="run(() => emit('insertTable'))"><Table2 :size="21" /><span>表格</span></button>
            <button type="button" @click="run(() => editor?.chain().focus().setHorizontalRule().run())"><Minus :size="21" /><span>分割线</span></button>
            <button type="button" @click="run(() => editor?.chain().focus().toggleCodeBlock().run())"><Code2 :size="21" /><span>代码块</span></button>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
