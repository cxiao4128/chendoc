<script setup lang="ts">
import { Bold, ImagePlus, Italic, List, ListOrdered, Plus, Redo2, Underline, Undo2 } from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import type { MobileToolbarSheet } from "./editor-types";

defineProps<{ editor: Editor | null }>();

defineEmits<{
  uploadImage: [];
  openSheet: [sheet: MobileToolbarSheet];
}>();
</script>

<template>
  <div class="editor-toolbar__primary editor-toolbar__primary--desktop">
    <button type="button" title="撤销" aria-label="撤销" :disabled="!editor" @click="editor?.chain().focus().undo().run()"><Undo2 :size="16" /></button>
    <button type="button" title="重做" aria-label="重做" :disabled="!editor" @click="editor?.chain().focus().redo().run()"><Redo2 :size="16" /></button>
    <span class="editor-toolbar__sep" />
    <button type="button" title="加粗" aria-label="加粗" :class="{ active: editor?.isActive('bold') }" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()"><Bold :size="16" /></button>
    <button type="button" title="斜体" aria-label="斜体" :class="{ active: editor?.isActive('italic') }" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()"><Italic :size="16" /></button>
    <button type="button" title="下划线" aria-label="下划线" :class="{ active: editor?.isActive('underline') }" :disabled="!editor" @click="editor?.chain().focus().toggleUnderline().run()"><Underline :size="16" /></button>
    <span class="editor-toolbar__sep" />
    <button type="button" title="无序列表" aria-label="无序列表" :class="{ active: editor?.isActive('bulletList') }" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()"><List :size="16" /></button>
    <button type="button" title="有序列表" aria-label="有序列表" :class="{ active: editor?.isActive('orderedList') }" :disabled="!editor" @click="editor?.chain().focus().toggleOrderedList().run()"><ListOrdered :size="16" /></button>
    <button type="button" title="图片" aria-label="图片" :disabled="!editor" @click="$emit('uploadImage')"><ImagePlus :size="16" /></button>
  </div>

  <div
    class="editor-toolbar__primary editor-toolbar__primary--mobile"
    data-testid="mobile-editor-toolbar"
    @pointerdown.prevent
  >
    <button type="button" title="撤销" aria-label="撤销" :disabled="!editor" @click="editor?.chain().focus().undo().run()">
      <Undo2 :size="21" />
    </button>
    <button type="button" title="重做" aria-label="重做" :disabled="!editor" @click="editor?.chain().focus().redo().run()">
      <Redo2 :size="21" />
    </button>
    <button type="button" title="文字格式" aria-label="文字格式" :disabled="!editor" @click="$emit('openSheet', 'format')">
      <span class="editor-toolbar__mobile-aa">Aa</span>
    </button>
    <button type="button" title="列表与引用" aria-label="列表与引用" :disabled="!editor" @click="$emit('openSheet', 'list')">
      <List :size="22" />
    </button>
    <button type="button" title="插入图片" aria-label="插入图片" :disabled="!editor" @click="$emit('uploadImage')">
      <ImagePlus :size="22" />
    </button>
    <button type="button" title="插入更多内容" aria-label="插入更多内容" :disabled="!editor" @click="$emit('openSheet', 'insert')">
      <Plus :size="24" />
    </button>
  </div>
</template>
