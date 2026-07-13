<script setup lang="ts">
import { CheckSquare, Code2, Heading1, Heading2, Heading3, Highlighter, Link, Minus, Palette, Quote, Strikethrough, Table2, Video } from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import type { EditorStylePatch } from "./editor-types";

defineProps<{
  show: boolean;
  editor: Editor | null;
}>();

const emit = defineEmits<{
  close: [];
  promptForLink: [];
  uploadVideo: [];
  setTextColor: [color: string];
  setHighlight: [color: string];
  setFontFamily: [value: string];
  insertTable: [];
  styleChange: [patch: EditorStylePatch];
}>();

function valueFromSelect(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

function resetTextColor() {
  emit("setTextColor", "");
  emit("close");
}

function resetHighlight() {
  emit("setHighlight", "");
  emit("close");
}
</script>

<template>
  <Transition name="toolbar-menu">
    <div v-if="show" class="editor-toolbar__more-menu" @click.stop>
      <div class="editor-toolbar__more-section">
        <span class="editor-toolbar__more-label">格式</span>
        <div class="editor-toolbar__more-grid">
          <button type="button" :class="{ active: editor?.isActive('heading', { level: 1 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">
            <Heading1 :size="16" /><span>标题1</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('heading', { level: 2 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">
            <Heading2 :size="16" /><span>标题2</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('heading', { level: 3 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">
            <Heading3 :size="16" /><span>标题3</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('strike') }" :disabled="!editor" @click="editor?.chain().focus().toggleStrike().run()">
            <Strikethrough :size="16" /><span>删除线</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('taskList') }" :disabled="!editor" @click="editor?.chain().focus().toggleTaskList().run()">
            <CheckSquare :size="16" /><span>待办</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('blockquote') }" :disabled="!editor" @click="editor?.chain().focus().toggleBlockquote().run()">
            <Quote :size="16" /><span>引用</span>
          </button>
          <button type="button" :class="{ active: editor?.isActive('codeBlock') }" :disabled="!editor" @click="editor?.chain().focus().toggleCodeBlock().run()">
            <Code2 :size="16" /><span>代码</span>
          </button>
          <button type="button" :disabled="!editor" @click="editor?.chain().focus().setHorizontalRule().run()">
            <Minus :size="16" /><span>分割线</span>
          </button>
          <button type="button" :disabled="!editor" @click="$emit('insertTable')">
            <Table2 :size="16" /><span>表格</span>
          </button>
        </div>
      </div>

      <div class="editor-toolbar__more-section">
        <span class="editor-toolbar__more-label">插入</span>
        <div class="editor-toolbar__more-grid">
          <button type="button" :class="{ active: editor?.isActive('link') }" :disabled="!editor" @click="$emit('promptForLink')">
            <Link :size="16" /><span>链接</span>
          </button>
          <button type="button" :disabled="!editor" @click="$emit('uploadVideo')">
            <Video :size="16" /><span>视频</span>
          </button>
          <button type="button" :disabled="!editor" @click="resetTextColor">
            <Palette :size="16" /><span>清除颜色</span>
          </button>
          <button type="button" :disabled="!editor" @click="resetHighlight">
            <Highlighter :size="16" /><span>清除高亮</span>
          </button>
        </div>
      </div>

      <div class="editor-toolbar__more-section">
        <span class="editor-toolbar__more-label">样式</span>
        <div class="editor-toolbar__more-grid">
          <select title="字体" aria-label="字体" :disabled="!editor" @change="$emit('setFontFamily', valueFromSelect($event))">
            <option value="">系统字体</option>
            <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
            <option value="'PingFang SC', sans-serif">苹方</option>
            <option value="'KaiTi', serif">楷体</option>
            <option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽</option>
          </select>
          <select title="字号" aria-label="字号" :disabled="!editor" @change="$emit('styleChange', { fontSize: valueFromSelect($event) })">
            <option value="16px">16px</option>
            <option value="15px">15px</option>
            <option value="18px">18px</option>
            <option value="20px">20px</option>
          </select>
        </div>
      </div>

      <button type="button" class="editor-toolbar__more-close" @click="$emit('close')">关闭</button>
    </div>
  </Transition>
  <div v-if="show" class="editor-toolbar__more-scrim" @click="$emit('close')" />
</template>
