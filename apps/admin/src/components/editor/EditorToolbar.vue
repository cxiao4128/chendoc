<script setup lang="ts">
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Video
} from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import { nativePrompt } from "../../services/nativeDialog";
import "./editor-toolbar.css";

interface EditorStylePatch {
  fontSize?: string;
  lineHeight?: string;
  paragraphGap?: string;
}

const props = defineProps<{ editor: Editor | null }>();
const emit = defineEmits<{
  uploadImage: [];
  uploadVideo: [];
  styleChange: [patch: EditorStylePatch];
}>();

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
  const chain = props.editor?.chain().focus() as any;
  if (!chain) return;
  if (value) chain.setFontFamily(value).run();
  else chain.unsetFontFamily().run();
}

function insertTable() {
  (props.editor?.chain().focus() as any)?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

function valueFromSelect(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

</script>

<template>
  <div class="editor-toolbar-wrap">
    <div class="editor-toolbar" role="toolbar" aria-label="编辑工具栏">
      <select title="字体" aria-label="字体" :disabled="!editor" @change="setFontFamily(valueFromSelect($event))">
        <option value="">系统默认</option>
        <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">系统字体</option>
        <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
        <option value="'PingFang SC', sans-serif">苹方</option>
        <option value="'AlibabaPuHuiTi', sans-serif">阿里巴巴普惠体</option>
        <option value="'SourceHanSans', sans-serif">思源黑体</option>
        <option value="'SourceHanSerif', serif">思源宋体</option>
        <option value="'KaiTi', serif">楷体</option>
        <option value="'SimSun', serif">宋体</option>
        <option value="'FangSong', serif">仿宋</option>
        <option value="'JetBrains Mono', monospace">等宽字体</option>
      </select>
      <select title="字号" aria-label="字号" @change="emit('styleChange', { fontSize: valueFromSelect($event) })">
        <option value="16px">16</option>
        <option value="15px">15</option>
        <option value="18px">18</option>
        <option value="20px">20</option>
      </select>
      <span class="editor-toolbar__sep" />

      <button type="button" title="撤销" aria-label="撤销" :disabled="!editor" @click="editor?.chain().focus().undo().run()">
        <Undo2 :size="16" />
      </button>
      <button type="button" title="重做" aria-label="重做" :disabled="!editor" @click="editor?.chain().focus().redo().run()">
        <Redo2 :size="16" />
      </button>
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

      <button type="button" title="加粗" aria-label="加粗" :class="{ active: editor?.isActive('bold') }" :disabled="!editor" @click="editor?.chain().focus().toggleBold().run()">
        <Bold :size="16" />
      </button>
      <button type="button" title="斜体" aria-label="斜体" :class="{ active: editor?.isActive('italic') }" :disabled="!editor" @click="editor?.chain().focus().toggleItalic().run()">
        <Italic :size="16" />
      </button>
      <button type="button" title="下划线" aria-label="下划线" :class="{ active: editor?.isActive('underline') }" :disabled="!editor" @click="editor?.chain().focus().toggleUnderline().run()">
        <Underline :size="16" />
      </button>
      <button type="button" title="删除线" aria-label="删除线" :class="{ active: editor?.isActive('strike') }" :disabled="!editor" @click="editor?.chain().focus().toggleStrike().run()">
        <Strikethrough :size="16" />
      </button>
      <span class="editor-toolbar__sep" />

      <button type="button" title="无序列表" aria-label="无序列表" :class="{ active: editor?.isActive('bulletList') }" :disabled="!editor" @click="editor?.chain().focus().toggleBulletList().run()">
        <List :size="16" />
      </button>
      <button type="button" title="有序列表" aria-label="有序列表" :class="{ active: editor?.isActive('orderedList') }" :disabled="!editor" @click="editor?.chain().focus().toggleOrderedList().run()">
        <ListOrdered :size="16" />
      </button>
      <button type="button" title="待办列表" aria-label="待办列表" :class="{ active: editor?.isActive('taskList') }" :disabled="!editor" @click="editor?.chain().focus().toggleTaskList().run()">
        <CheckSquare :size="16" />
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
      <button type="button" title="表格" aria-label="表格" :disabled="!editor" @click="insertTable">
        <Table2 :size="16" />
      </button>
      <span class="editor-toolbar__sep" />

      <button type="button" title="链接" aria-label="链接" :class="{ active: editor?.isActive('link') }" :disabled="!editor" @click="promptForLink">
        <Link :size="16" />
      </button>
      <button type="button" title="图片" aria-label="图片" :disabled="!editor" @click="emit('uploadImage')">
        <ImagePlus :size="16" />
      </button>
      <button type="button" title="视频" aria-label="视频" :disabled="!editor" @click="emit('uploadVideo')">
        <Video :size="16" />
      </button>
    </div>
  </div>
</template>
