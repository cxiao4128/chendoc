<script setup lang="ts">
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Video
} from "lucide-vue-next";
import type { CSSProperties } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { EditorStylePatch } from "./editor-types";
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "./editor-toolbar-options";
import ToolbarColorPicker from "./ToolbarColorPicker.vue";

defineProps<{
  editor: Editor | null;
  textColorOpen: boolean;
  highlightOpen: boolean;
  textColorStyle: CSSProperties;
  highlightStyle: CSSProperties;
  currentTextColor: string;
  currentHighlight: string;
}>();

defineEmits<{
  uploadImage: [];
  uploadVideo: [];
  styleChange: [patch: EditorStylePatch];
  promptForLink: [];
  setFontFamily: [value: string];
  insertTable: [];
  openTextColorPicker: [event: MouseEvent];
  openHighlightPicker: [event: MouseEvent];
  setTextColor: [color: string];
  setHighlight: [color: string];
}>();

function valueFromSelect(event: Event) {
  return (event.target as HTMLSelectElement).value;
}
</script>

<template>
  <div class="editor-toolbar__secondary">
    <select title="字体" aria-label="字体" :disabled="!editor" @change="$emit('setFontFamily', valueFromSelect($event))">
      <option value="">系统默认</option>
      <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">系统字体</option>
      <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
      <option value="'PingFang SC', sans-serif">苹方</option>
      <option value="'KaiTi', serif">楷体</option>
      <option value="'SimSun', serif">宋体</option>
      <option value="'FangSong', serif">仿宋</option>
      <option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽字体</option>
    </select>
    <select title="字号" aria-label="字号" @change="$emit('styleChange', { fontSize: valueFromSelect($event) })">
      <option value="16px">16</option>
      <option value="15px">15</option>
      <option value="18px">18</option>
      <option value="20px">20</option>
    </select>
    <span class="editor-toolbar__sep" />

    <button type="button" title="一级标题" aria-label="一级标题" :class="{ active: editor?.isActive('heading', { level: 1 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">
      <Heading1 :size="16" />
    </button>
    <button type="button" title="二级标题" aria-label="二级标题" :class="{ active: editor?.isActive('heading', { level: 2 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">
      <Heading2 :size="16" />
    </button>
    <button type="button" title="三级标题" aria-label="三级标题" :class="{ active: editor?.isActive('heading', { level: 3 }) }" :disabled="!editor" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">
      <Heading3 :size="16" />
    </button>
    <span class="editor-toolbar__sep" />

    <button type="button" title="删除线" aria-label="删除线" :class="{ active: editor?.isActive('strike') }" :disabled="!editor" @click="editor?.chain().focus().toggleStrike().run()">
      <Strikethrough :size="16" />
    </button>
    <button type="button" title="待办列表" aria-label="待办列表" :class="{ active: editor?.isActive('taskList') }" :disabled="!editor" @click="editor?.chain().focus().toggleTaskList().run()">
      <CheckSquare :size="16" />
    </button>
    <button type="button" title="无序列表" aria-label="无序列表" :class="{ active: editor?.isActive('bulletList') }" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">
      <List :size="16" />
    </button>
    <button type="button" title="有序列表" aria-label="有序列表" :class="{ active: editor?.isActive('orderedList') }" :disabled="!editor" @click="editor?.chain().focus().toggleOrderedList().run()">
      <ListOrdered :size="16" />
    </button>
    <button type="button" title="引用" aria-label="引用" :class="{ active: editor?.isActive('blockquote') }" :disabled="!editor" @click="editor?.chain().focus().toggleBlockquote().run()">
      <Quote :size="16" />
    </button>
    <button type="button" title="代码块" aria-label="代码块" :class="{ active: editor?.isActive('codeBlock') }" :disabled="!editor" @click="editor?.chain().focus().toggleCodeBlock().run()">
      <Code2 :size="16" />
    </button>
    <button type="button" title="分割线" aria-label="分割线" :disabled="!editor" @click="editor?.chain().focus().setHorizontalRule().run()">
      <Minus :size="16" />
    </button>
    <button type="button" title="表格" aria-label="表格" :disabled="!editor" @click="$emit('insertTable')">
      <Table2 :size="16" />
    </button>
    <span class="editor-toolbar__sep" />

    <button type="button" title="链接" aria-label="链接" :class="{ active: editor?.isActive('link') }" :disabled="!editor" @click="$emit('promptForLink')">
      <Link :size="16" />
    </button>
    <button type="button" title="图片" aria-label="图片" :disabled="!editor" @click="$emit('uploadImage')">
      <ImagePlus :size="16" />
    </button>
    <button type="button" title="视频" aria-label="视频" :disabled="!editor" @click="$emit('uploadVideo')">
      <Video :size="16" />
    </button>
    <span class="editor-toolbar__sep" />

    <ToolbarColorPicker
      kind="text"
      :open="textColorOpen"
      :current="currentTextColor"
      :dropdown-style="textColorStyle"
      :colors="TEXT_COLORS"
      @toggle="$emit('openTextColorPicker', $event)"
      @select="$emit('setTextColor', $event)"
      @custom="$emit('setTextColor', $event)"
    />
    <ToolbarColorPicker
      kind="highlight"
      :open="highlightOpen"
      :current="currentHighlight"
      :dropdown-style="highlightStyle"
      :colors="HIGHLIGHT_COLORS"
      @toggle="$emit('openHighlightPicker', $event)"
      @select="$emit('setHighlight', $event)"
      @custom="$emit('setHighlight', $event)"
    />
  </div>
</template>
