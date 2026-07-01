<script setup lang="ts">
import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Video,
  MoreHorizontal
} from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import { ref, onMounted, onUnmounted } from "vue";
import { nativePrompt } from "../../services/nativeDialog";
import "./editor-toolbar.css";

interface EditorStylePatch {
  fontSize?: string;
  lineHeight?: string;
  paragraphGap?: string;
}

// 预设颜色
const TEXT_COLORS = [
  { name: "默认", value: "" },
  { name: "黑色", value: "#000000" },
  { name: "深灰", value: "#374151" },
  { name: "红色", value: "#dc2626" },
  { name: "橙色", value: "#ea580c" },
  { name: "黄色", value: "#ca8a04" },
  { name: "绿色", value: "#16a34a" },
  { name: "青色", value: "#0891b2" },
  { name: "蓝色", value: "#2563eb" },
  { name: "紫色", value: "#9333ea" },
  { name: "粉色", value: "#db2777" }
];

const HIGHLIGHT_COLORS = [
  { name: "无", value: "" },
  { name: "黄色", value: "#fef08a" },
  { name: "橙色", value: "#fed7aa" },
  { name: "绿色", value: "#bbf7d0" },
  { name: "青色", value: "#a5f3fc" },
  { name: "蓝色", value: "#bfdbfe" },
  { name: "紫色", value: "#e9d5ff" },
  { name: "粉色", value: "#fbcfe8" },
  { name: "红色", value: "#fecaca" },
  { name: "灰色", value: "#e5e7eb" }
];

const props = defineProps<{ editor: Editor | null }>();
const emit = defineEmits<{
  uploadImage: [];
  uploadVideo: [];
  styleChange: [patch: EditorStylePatch];
}>();

// 移动端折叠菜单状态
const showMoreMenu = ref(false);

function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
}

function closeMoreMenu() {
  showMoreMenu.value = false;
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".editor-toolbar__more-menu")) {
    closeMoreMenu();
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

// 文本颜色
function setTextColor(color: string) {
  const editor = props.editor;
  if (!editor) return;
  if (color) {
    editor.chain().focus().setColor(color).run();
  } else {
    editor.chain().focus().unsetColor().run();
  }
}

function handleTextColorChange(event: Event) {
  const input = event.target as HTMLInputElement;
  setTextColor(input.value);
}

// 高亮背景色
function setHighlight(color: string) {
  const editor = props.editor;
  if (!editor) return;
  if (color) {
    editor.chain().focus().toggleHighlight({ color }).run();
  } else {
    editor.chain().focus().unsetHighlight().run();
  }
}

function handleHighlightChange(event: Event) {
  const input = event.target as HTMLInputElement;
  setHighlight(input.value);
}

// 获取当前颜色状态
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
      <!-- 第一行：核心工具（移动端优先显示） -->
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
        <button type="button" title="图片" aria-label="图片" :disabled="!editor" @click="emit('uploadImage')">
          <ImagePlus :size="16" />
        </button>

        <!-- 移动端更多菜单按钮 -->
        <button type="button" class="editor-toolbar__more-btn" title="更多" aria-label="更多工具" @click="toggleMoreMenu">
          <MoreHorizontal :size="18" />
        </button>
      </div>

      <!-- 第二行：桌面端完整工具栏 -->
      <div class="editor-toolbar__secondary">
        <select title="字体" aria-label="字体" :disabled="!editor" @change="setFontFamily(valueFromSelect($event))">
          <option value="">系统默认</option>
          <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">系统字体</option>
          <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
          <option value="'PingFang SC', sans-serif">苹方</option>
          <option value="'KaiTi', serif">楷体</option>
          <option value="'SimSun', serif">宋体</option>
          <option value="'FangSong', serif">仿宋</option>
          <option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽字体</option>
        </select>
        <select title="字号" aria-label="字号" @change="emit('styleChange', { fontSize: valueFromSelect($event) })">
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
        <button type="button" title="视频" aria-label="视频" :disabled="!editor" @click="emit('uploadVideo')">
          <Video :size="16" />
        </button>
        <span class="editor-toolbar__sep" />

        <!-- 文本颜色选择器 -->
        <div class="editor-toolbar__color-picker">
          <button type="button" class="editor-toolbar__color-btn" title="文本颜色" aria-label="文本颜色" :disabled="!editor" @click="setTextColor('')">
            <Palette :size="16" />
            <span class="editor-toolbar__color-preview" :style="{ backgroundColor: getCurrentTextColor() || 'transparent' }"></span>
          </button>
          <div class="editor-toolbar__color-dropdown">
            <div class="editor-toolbar__color-label">文本颜色</div>
            <div class="editor-toolbar__color-grid">
              <button
                v-for="color in TEXT_COLORS"
                :key="color.value"
                type="button"
                class="editor-toolbar__color-swatch"
                :class="{ active: getCurrentTextColor() === color.value, 'is-reset': !color.value }"
                :style="color.value ? { backgroundColor: color.value } : {}"
                :title="color.name"
                @click="setTextColor(color.value)"
              >
                <span v-if="!color.value">—</span>
              </button>
            </div>
            <div class="editor-toolbar__color-custom">
              <label>
                <span>自定义</span>
                <input type="color" :value="getCurrentTextColor()" @input="handleTextColorChange" />
              </label>
            </div>
          </div>
        </div>

        <!-- 高亮背景色选择器 -->
        <div class="editor-toolbar__color-picker">
          <button type="button" class="editor-toolbar__color-btn" title="高亮背景" aria-label="高亮背景" :disabled="!editor" @click="setHighlight('')">
            <Highlighter :size="16" />
            <span class="editor-toolbar__color-preview editor-toolbar__color-preview--highlight" :style="{ backgroundColor: getCurrentHighlight() || 'transparent' }"></span>
          </button>
          <div class="editor-toolbar__color-dropdown">
            <div class="editor-toolbar__color-label">高亮背景</div>
            <div class="editor-toolbar__color-grid">
              <button
                v-for="color in HIGHLIGHT_COLORS"
                :key="color.value"
                type="button"
                class="editor-toolbar__color-swatch"
                :class="{ active: getCurrentHighlight() === color.value, 'is-reset': !color.value }"
                :style="color.value ? { backgroundColor: color.value } : {}"
                :title="color.name"
                @click="setHighlight(color.value)"
              >
                <span v-if="!color.value">—</span>
              </button>
            </div>
            <div class="editor-toolbar__color-custom">
              <label>
                <span>自定义</span>
                <input type="color" :value="getCurrentHighlight()" @input="handleHighlightChange" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 移动端更多菜单 -->
      <Transition name="toolbar-menu">
        <div v-if="showMoreMenu" class="editor-toolbar__more-menu" @click.stop>
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
              <button type="button" :disabled="!editor" @click="insertTable">
                <Table2 :size="16" /><span>表格</span>
              </button>
            </div>
          </div>

          <div class="editor-toolbar__more-section">
            <span class="editor-toolbar__more-label">插入</span>
            <div class="editor-toolbar__more-grid">
              <button type="button" :class="{ active: editor?.isActive('link') }" :disabled="!editor" @click="promptForLink">
                <Link :size="16" /><span>链接</span>
              </button>
              <button type="button" :disabled="!editor" @click="emit('uploadVideo')">
                <Video :size="16" /><span>视频</span>
              </button>
              <button type="button" :disabled="!editor" @click="setTextColor(''); closeMoreMenu()">
                <Palette :size="16" /><span>颜色</span>
              </button>
              <button type="button" :disabled="!editor" @click="setHighlight(''); closeMoreMenu()">
                <Highlighter :size="16" /><span>高亮</span>
              </button>
            </div>
          </div>

          <div class="editor-toolbar__more-section">
            <span class="editor-toolbar__more-label">样式</span>
            <div class="editor-toolbar__more-grid">
              <select title="字体" aria-label="字体" :disabled="!editor" @change="setFontFamily(valueFromSelect($event))">
                <option value="">系统字体</option>
                <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                <option value="'PingFang SC', sans-serif">苹方</option>
                <option value="'KaiTi', serif">楷体</option>
                <option value="ui-monospace, SFMono-Regular, Consolas, monospace">等宽</option>
              </select>
              <select title="字号" aria-label="字号" :disabled="!editor" @change="emit('styleChange', { fontSize: valueFromSelect($event) })">
                <option value="16px">16px</option>
                <option value="15px">15px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
              </select>
            </div>
          </div>

          <button type="button" class="editor-toolbar__more-close" @click="closeMoreMenu">关闭</button>
        </div>
      </Transition>
      <div v-if="showMoreMenu" class="editor-toolbar__more-scrim" @click="closeMoreMenu" />
    </div>
  </div>
</template>
