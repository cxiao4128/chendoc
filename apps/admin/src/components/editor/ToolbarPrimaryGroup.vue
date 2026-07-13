<script setup lang="ts">
import { Bold, ImagePlus, Italic, List, ListOrdered, MoreHorizontal, Redo2, Underline, Undo2 } from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";

defineProps<{
  editor: Editor | null;
}>();

defineEmits<{
  uploadImage: [];
  toggleMoreMenu: [];
}>();
</script>

<template>
  <div class="editor-toolbar__primary">
    <button type="button" title="撤销" aria-label="撤销" :disabled="!editor" @click="editor?.chain().focus().undo().run()">
      <Undo2 :size="16" />
    </button>
    <button type="button" title="重做" aria-label="重做" :disabled="!editor" @click="editor?.chain().focus().redo().run()">
      <Redo2 :size="16" />
    </button>
    <span class="editor-toolbar__sep" />

    <button type="button" title="加粗" aria-label="加粗" :class="{ active: editor?.isActive('bold') }" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()">
      <Bold :size="16" />
    </button>
    <button type="button" title="斜体" aria-label="斜体" :class="{ active: editor?.isActive('italic') }" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()">
      <Italic :size="16" />
    </button>
    <button type="button" title="下划线" aria-label="下划线" :class="{ active: editor?.isActive('underline') }" :disabled="!editor" @click="editor?.chain().focus().toggleUnderline().run()">
      <Underline :size="16" />
    </button>
    <span class="editor-toolbar__sep" />

    <button type="button" title="无序列表" aria-label="无序列表" :class="{ active: editor?.isActive('bulletList') }" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">
      <List :size="16" />
    </button>
    <button type="button" title="有序列表" aria-label="有序列表" :class="{ active: editor?.isActive('orderedList') }" :disabled="!editor" @click="editor?.chain().focus().toggleOrderedList().run()">
      <ListOrdered :size="16" />
    </button>
    <button type="button" title="图片" aria-label="图片" :disabled="!editor" @click="$emit('uploadImage')">
      <ImagePlus :size="16" />
    </button>

    <button type="button" class="editor-toolbar__more-btn" title="更多" aria-label="更多工具" @click.stop="$emit('toggleMoreMenu')">
      <MoreHorizontal :size="18" />
    </button>
  </div>
</template>
