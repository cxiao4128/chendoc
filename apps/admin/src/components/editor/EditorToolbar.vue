<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { CSSProperties } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { nativePrompt } from "../../services/nativeDialog";
import type { EditorStylePatch, TipTapCommandChain } from "./editor-types";
import ToolbarMoreMenu from "./ToolbarMoreMenu.vue";
import ToolbarPrimaryGroup from "./ToolbarPrimaryGroup.vue";
import ToolbarSecondaryGroup from "./ToolbarSecondaryGroup.vue";
import "./editor-toolbar.css";

const props = defineProps<{ editor: Editor | null }>();
const emit = defineEmits<{
  uploadImage: [];
  uploadVideo: [];
  styleChange: [patch: EditorStylePatch];
}>();

const showMoreMenu = ref(false);
const textColorOpen = ref(false);
const highlightOpen = ref(false);
const textColorStyle = ref<CSSProperties>({});
const highlightStyle = ref<CSSProperties>({});

function getDropdownStyle(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  if (!target) return { top: "50px", left: "100px" };
  const rect = target.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dropdownWidth = 224;
  const dropdownHeight = 180;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top: number;
  if (spaceBelow >= dropdownHeight + 8) top = rect.bottom + 4;
  else if (spaceAbove >= dropdownHeight + 8) top = rect.top - dropdownHeight - 4;
  else top = rect.bottom + 4;

  let left = Math.max(8, rect.left);
  if (left + dropdownWidth > viewportWidth - 8) {
    left = viewportWidth - dropdownWidth - 8;
  }

  return {
    top: `${top}px`,
    left: `${left}px`
  };
}

function openTextColorPicker(event: MouseEvent) {
  event.stopPropagation();
  textColorOpen.value = !textColorOpen.value;
  if (textColorOpen.value) {
    textColorStyle.value = getDropdownStyle(event);
    highlightOpen.value = false;
  }
}

function openHighlightPicker(event: MouseEvent) {
  event.stopPropagation();
  highlightOpen.value = !highlightOpen.value;
  if (highlightOpen.value) {
    highlightStyle.value = getDropdownStyle(event);
    textColorOpen.value = false;
  }
}

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
}

function closeMoreMenu() {
  showMoreMenu.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".editor-toolbar__more-menu") && !target.closest(".editor-toolbar__more-btn")) {
    closeMoreMenu();
  }
  if (!target.closest(".editor-toolbar__color-picker")) {
    textColorOpen.value = false;
    highlightOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function promptForLink() {
  const editor = props.editor;
  if (!editor) return;
  const currentUrl = editor.getAttributes("link").href || "";
  const nextUrl = await nativePrompt({
    title: "链接地址",
    label: "URL",
    value: currentUrl,
    placeholder: "https://example.com",
    confirmText: "应用链接"
  });
  if (nextUrl === null) return;
  const url = normalizeUrl(nextUrl);
  if (!url) editor.chain().focus().unsetLink().run();
  else editor.chain().focus().setLink({ href: url, target: "_blank" }).run();
}

function setFontFamily(value: string) {
  const chain = props.editor?.chain().focus() as TipTapCommandChain | undefined;
  if (!chain) return;
  if (value) chain.setFontFamily(value).run();
  else chain.unsetFontFamily().run();
}

function insertTable() {
  (props.editor?.chain().focus() as TipTapCommandChain | undefined)?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function setTextColor(color: string) {
  const editor = props.editor;
  if (!editor) return;
  if (color) editor.chain().focus().setColor(color).run();
  else editor.chain().focus().unsetColor().run();
}

function setHighlight(color: string) {
  const editor = props.editor;
  if (!editor) return;
  if (color) editor.chain().focus().toggleHighlight({ color }).run();
  else editor.chain().focus().unsetHighlight().run();
}

function getCurrentTextColor() {
  return props.editor?.getAttributes("textStyle").color || "";
}

function getCurrentHighlight() {
  return props.editor?.getAttributes("highlight").color || "";
}
</script>

<template>
  <div class="editor-toolbar-wrap">
    <div class="editor-toolbar" role="toolbar" aria-label="编辑工具栏">
      <ToolbarPrimaryGroup
        :editor="editor"
        @upload-image="emit('uploadImage')"
        @toggle-more-menu="toggleMoreMenu"
      />

      <ToolbarSecondaryGroup
        :editor="editor"
        :text-color-open="textColorOpen"
        :highlight-open="highlightOpen"
        :text-color-style="textColorStyle"
        :highlight-style="highlightStyle"
        :current-text-color="getCurrentTextColor()"
        :current-highlight="getCurrentHighlight()"
        @upload-image="emit('uploadImage')"
        @upload-video="emit('uploadVideo')"
        @style-change="emit('styleChange', $event)"
        @prompt-for-link="promptForLink"
        @set-font-family="setFontFamily"
        @insert-table="insertTable"
        @open-text-color-picker="openTextColorPicker"
        @open-highlight-picker="openHighlightPicker"
        @set-text-color="setTextColor"
        @set-highlight="setHighlight"
      />

      <ToolbarMoreMenu
        :show="showMoreMenu"
        :editor="editor"
        @close="closeMoreMenu"
        @prompt-for-link="promptForLink"
        @upload-video="emit('uploadVideo')"
        @set-text-color="setTextColor"
        @set-highlight="setHighlight"
        @set-font-family="setFontFamily"
        @insert-table="insertTable"
        @style-change="emit('styleChange', $event)"
      />
    </div>
  </div>
</template>
