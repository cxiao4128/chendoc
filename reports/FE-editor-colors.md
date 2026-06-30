# FE-编辑器升级与颜色功能设计方案

## 1. 现状分析

### 1.1 当前编辑器技术栈

| 组件 | 版本 | 状态 |
|------|------|------|
| `@tiptap/core` | ^3.7.2 | ✅ 已使用 |
| `@tiptap/extension-color` | ^3.27.1 | ✅ 已安装，未暴露 UI |
| `@tiptap/extension-text-style` | ^3.7.2 | ✅ 已使用 |
| `@tiptap/extension-highlight` | ^3.27.1 | ✅ 已安装，未暴露 UI |
| `lucide-vue-next` | ^0.548.0 | ✅ 已使用（Palette 图标） |

### 1.2 现有编辑器配置

**editor-runtime.ts** (已配置 Color 和 Highlight):
```typescript
Color,           // 已启用
Highlight.configure({ multicolor: true }),  // 多色高亮已启用
```

**EditorToolbar.vue**:
- 有 `Palette` 图标导入但未使用
- 无颜色选择器 UI

### 1.3 缺口分析

| 功能 | 现有 | 需求 |
|------|------|------|
| 前景色选择 | ❌ 无 | ✅ 需要 |
| 背景色选择 | ❌ 无 | ✅ 需要 |
| 批注系统 | ❌ 无 | ✅ 需要 |
| 移动端触控 | ⚠️ 基础 | ✅ 需优化 |
| 大文档性能 | ⚠️ 防抖 | ✅ 需增强 |

---

## 2. 文本颜色选择器

### 2.1 ColorPicker 组件设计

**文件**: `apps/admin/src/components/editor/ColorPicker.vue`

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import "./color-picker.css";

interface Props {
  modelValue: string;        // 当前颜色值 (#rrggbb 或 rgb())
  label: string;             // 按钮提示
  allowClear?: boolean;     // 是否允许清除颜色
}

const props = withDefaults(defineProps<Props>(), {
  allowClear: false
});

const emit = defineEmits<{
  "update:modelValue": [color: string];
}>();

// 预设颜色数组
const presetColors = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#000000", "#6b7280", "#374151", "#ffffff"
];

const showPicker = ref(false);
const customColor = ref(props.modelValue || "#000000");
const inputRef = ref<HTMLInputElement | null>(null);

function selectPreset(color: string) {
  emit("update:modelValue", color);
  showPicker.value = false;
}

function applyCustom() {
  emit("update:modelValue", customColor.value);
  showPicker.value = false;
}

function clearColor() {
  emit("update:modelValue", "");
  showPicker.value = false;
}

function openNativePicker() {
  inputRef.value?.click();
}

function onNativeChange(e: Event) {
  const target = e.target as HTMLInputElement;
  customColor.value = target.value;
  applyCustom();
}

const currentColor = computed(() => props.modelValue || "transparent");
</script>
```

### 2.2 颜色选择器样式

**文件**: `apps/admin/src/components/editor/color-picker.css`

```css
.color-picker {
  position: relative;
  display: inline-block;
}

.color-picker__trigger {
  width: 34px;
  height: 34px;
  border: 1px solid var(--cd-border);
  border-radius: 8px;
  background: var(--cd-panel);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.color-picker__trigger::before {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 4px;
  background: currentColor;
}

.color-picker__trigger.active {
  border-color: var(--cd-primary);
  box-shadow: 0 0 0 3px var(--cd-focus);
}

.color-picker__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 200px;
  border: 1px solid var(--cd-border);
  border-radius: 10px;
  background: var(--cd-panel);
  box-shadow: var(--cd-shadow);
  padding: 12px;
}

.color-picker__presets {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.color-picker__preset {
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.color-picker__preset:hover {
  transform: scale(1.1);
  border-color: var(--cd-muted);
}

.color-picker__preset.selected {
  border-color: var(--cd-accent);
}

.color-picker__custom {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--cd-border);
}

.color-picker__custom input[type="color"] {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
}

.color-picker__custom input[type="text"] {
  flex: 1;
  height: 32px;
  border: 1px solid var(--cd-border);
  border-radius: 6px;
  padding: 0 8px;
  font-family: var(--cd-font-mono);
  font-size: 13px;
}

.color-picker__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.color-picker__actions button {
  flex: 1;
  height: 32px;
  border: 1px solid var(--cd-border);
  border-radius: 6px;
  background: var(--cd-panel);
  cursor: pointer;
  font-size: 13px;
}
```

---

## 3. 高亮批注系统

### 3.1 批注扩展设计

**文件**: `apps/admin/src/components/editor/AnnotationExtension.ts`

```typescript
import { Mark, mergeAttributes } from "@tiptap/core";

export interface AnnotationOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotation: {
      setAnnotation: (attrs: { id: string; author: string; color: string }) => ReturnType;
      unsetAnnotation: () => ReturnType;
      updateAnnotation: (attrs: { id: string; text: string }) => ReturnType;
    };
  }
}

export const Annotation = Mark.create<AnnotationOptions>({
  name: "annotation",

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-annotation-id"),
        renderHTML: (attributes) => ({
          "data-annotation-id": attributes.id
        })
      },
      author: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-annotation-author"),
        renderHTML: (attributes) => ({
          "data-annotation-author": attributes.author
        })
      },
      color: {
        default: "#fef08a",
        parseHTML: (element) => element.getAttribute("data-annotation-color") || "#fef08a",
        renderHTML: (attributes) => ({
          "data-annotation-color": attributes.color
        })
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-annotation-resolved") === "true",
        renderHTML: (attributes) => ({
          "data-annotation-resolved": attributes.resolved ? "true" : "false"
        })
      }
    };
  },

  parseHTML() {
    return [{ tag: "span[data-annotation-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "cd-annotation"
      }),
      0
    ];
  },

  addCommands() {
    return {
      setAnnotation:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
      unsetAnnotation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      updateAnnotation:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { $from, $to } = selection;
          const annotationMark = state.schema.marks.annotation;

          if (!annotationMark) return false;

          let changed = false;
          tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type === annotationMark && mark.attrs.id === attrs.id) {
                const from = pos;
                const to = pos + node.nodeSize;
                tr.addMark(from, to, annotationMark.create({ ...mark.attrs, ...attrs }));
                changed = true;
              }
            });
          });

          if (dispatch && changed) dispatch(tr);
          return changed;
        }
    };
  }
});
```

### 3.2 批注侧边栏组件

**文件**: `apps/admin/src/components/editor/AnnotationSidebar.vue`

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { MessageSquare, Check, Trash2, X } from "lucide-vue-next";
import type { Editor } from "@tiptap/vue-3";
import "./annotation-sidebar.css";

interface Annotation {
  id: string;
  author: string;
  color: string;
  text: string;
  resolved: boolean;
  timestamp: number;
}

interface Props {
  editor: Editor | null;
  annotations: Annotation[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  resolve: [id: string];
  delete: [id: string];
  jump: [id: string, pos: { from: number; to: number }];
}>();

const activeId = ref<string | null>(null);

function handleResolve(id: string) {
  emit("resolve", id);
  if (activeId.value === id) activeId.value = null;
}

function handleDelete(id: string) {
  emit("delete", id);
  if (activeId.value === id) activeId.value = null;
}

function jumpToAnnotation(id: string) {
  activeId.value = id;
  // 通过编辑器 API 找到位置并滚动
  const pos = findAnnotationPosition(props.editor, id);
  if (pos) emit("jump", id, pos);
}

function findAnnotationPosition(editor: Editor | null, id: string) {
  if (!editor) return null;
  let result: { from: number; to: number } | null = null;

  editor.view.state.doc.descendants((node, pos) => {
    const mark = node.marks.find(
      (m) => m.type.name === "annotation" && m.attrs.id === id
    );
    if (mark) {
      result = { from: pos, to: pos + node.nodeSize };
      return false;
    }
  });

  return result;
}

const unresolvedCount = computed(
  () => props.annotations.filter((a) => !a.resolved).length
);
</script>

<template>
  <aside class="annotation-sidebar">
    <header class="annotation-sidebar__header">
      <h3>批注</h3>
      <span v-if="unresolvedCount > 0" class="annotation-sidebar__count">
        {{ unresolvedCount }}
      </span>
    </header>

    <div v-if="annotations.length === 0" class="annotation-sidebar__empty">
      <MessageSquare :size="32" />
      <p>暂无批注</p>
      <span>选中文字添加批注</span>
    </div>

    <ul v-else class="annotation-sidebar__list">
      <li
        v-for="ann in annotations"
        :key="ann.id"
        :class="{ resolved: ann.resolved, active: activeId === ann.id }"
        @click="jumpToAnnotation(ann.id)"
      >
        <div class="annotation-item__header">
          <span
            class="annotation-item__dot"
            :style="{ background: ann.color }"
          />
          <span class="annotation-item__author">{{ ann.author }}</span>
          <span class="annotation-item__time">
            {{ formatTime(ann.timestamp) }}
          </span>
        </div>
        <p class="annotation-item__text">{{ ann.text }}</p>
        <div class="annotation-item__actions">
          <button
            v-if="!ann.resolved"
            title="标记已解决"
            @click.stop="handleResolve(ann.id)"
          >
            <Check :size="14" />
          </button>
          <button title="删除批注" @click.stop="handleDelete(ann.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </li>
    </ul>
  </aside>
</template>
```

---

## 4. 工具栏增强

### 4.1 更新 EditorToolbar.vue

在工具栏添加颜色选择按钮：

```vue
<script setup lang="ts">
// 新增导入
import ColorPicker from "./ColorPicker.vue";
import TextColorIcon from "./icons/TextColorIcon.vue";
import BgColorIcon from "./icons/BgColorIcon.vue";

// 新增状态
const textColor = ref("");
const bgColor = ref("");

// 新增方法
function setTextColor(color: string) {
  textColor.value = color;
  if (!color) {
    editor?.chain().focus().unsetColor().run();
  } else {
    editor?.chain().focus().setColor(color).run();
  }
}

function setBgColor(color: string) {
  bgColor.value = color;
  if (!color) {
    editor?.chain().focus().unsetHighlight({ color: "" }).run();
  } else {
    editor?.chain().focus().setHighlight({ color }).run();
  }
}
</script>

<template>
  <div class="editor-toolbar" role="toolbar">
    <!-- ... 现有按钮 ... -->

    <span class="editor-toolbar__sep" />

    <!-- 新增：文本颜色 -->
    <ColorPicker
      :model-value="textColor"
      label="文本颜色"
      @update:model-value="setTextColor"
    >
      <template #default>
        <TextColorIcon :size="16" />
      </template>
    </ColorPicker>

    <!-- 新增：背景颜色（高亮） -->
    <ColorPicker
      :model-value="bgColor"
      label="背景颜色"
      @update:model-value="setBgColor"
    >
      <template #default>
        <BgColorIcon :size="16" />
      </template>
    </ColorPicker>

    <!-- 新增：添加批注按钮 -->
    <button
      v-if="editor && !editor.state.selection.empty"
      type="button"
      title="添加批注"
      aria-label="添加批注"
      @click="openAnnotationDialog"
    >
      <MessageSquare :size="16" />
    </button>
  </div>
</template>
```

---

## 5. 移动端触控优化

### 5.1 问题分析

| 问题 | 影响 |
|------|------|
| 工具栏按钮过小 | 触控误触率高 |
| 长按无上下文菜单 | 无法快速访问格式刷 |
| 双击选词行为不一致 | 编辑体验割裂 |
| 软键盘弹出布局跳动 | 用户体验差 |

### 5.2 优化方案

**文件**: `apps/admin/src/composables/useMobileEditor.ts`

```typescript
import { ref, onMounted, onUnmounted } from "vue";
import type { Editor } from "@tiptap/vue-3";

export function useMobileEditor(editor: Editor | null) {
  const isTouchDevice = ref(false);
  const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const selectedBlock = ref<{ from: number; to: number } | null>(null);

  onMounted(() => {
    isTouchDevice.value = "ontouchstart" in window;

    if (isTouchDevice.value) {
      document.documentElement.classList.add("touch-device");
      enableTouchOptimizations();
    }
  });

  onUnmounted(() => {
    disableTouchOptimizations();
  });

  function enableTouchOptimizations() {
    // 1. 增加触控区域
    document.documentElement.style.setProperty(
      "--toolbar-btn-size",
      "44px"
    );

    // 2. 长按选中块显示上下文菜单
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });

    // 3. 禁用双击缩放（编辑区域内）
    document.querySelectorAll(".chendoc-editor__surface").forEach((el) => {
      (el as HTMLElement).addEventListener("dblclick", (e) => {
        e.preventDefault();
      }, { passive: false });
    });
  }

  function disableTouchOptimizations() {
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchend", handleTouchEnd);
    document.removeEventListener("touchmove", handleTouchMove);
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;

    const target = e.target as HTMLElement;
    const blockElement = target.closest("p, h1, h2, h3, li, blockquote, pre");

    if (blockElement && editor) {
      const pos = editor.view.posAtDOM(blockElement, 0);
      selectedBlock.value = { from: pos, to: pos + blockElement.textContent?.length || 0 };

      // 长按 500ms 触发上下文菜单
      longPressTimer.value = setTimeout(() => {
        showBlockMenu(blockElement, e.touches[0]);
        selectedBlock.value = null;
      }, 500);
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
  }

  function handleTouchMove() {
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value);
      longPressTimer.value = null;
    }
  }

  function showBlockMenu(element: Element, touch: Touch) {
    // 触发块操作菜单（复用现有 slash 菜单逻辑）
    const event = new CustomEvent("show-block-menu", {
      detail: { element, x: touch.clientX, y: touch.clientY }
    });
    document.dispatchEvent(event);
  }

  return {
    isTouchDevice,
    selectedBlock
  };
}
```

---

## 6. 大文档性能优化

### 6.1 当前性能现状

| 场景 | 当前实现 | 性能表现 |
|------|----------|----------|
| 内容更新防抖 | ✅ 250ms-1200ms 动态 | 良好 |
| TOC 生成防抖 | ✅ 400ms 防抖 | 良好 |
| 图片懒加载 | ✅ HTML 属性 | 良好 |

### 6.2 虚拟列表方案

**文件**: `apps/admin/src/components/editor/VirtualEditor.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type { Editor } from "@tiptap/vue-3";
import "./virtual-editor.css";

interface Props {
  editor: Editor | null;
  content: string;
  itemHeight?: number;      // 预估每行高度
  overscan?: number;        // 上下额外渲染行数
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 28,
  overscan: 10
});

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

// 将内容解析为行
const lines = computed(() => {
  if (!props.editor) return [];
  return props.editor.getText().split("\n");
});

const totalHeight = computed(() => lines.value.length * props.itemHeight);

// 计算可见区域
const visibleRange = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - props.overscan);
  const visibleCount = Math.ceil(containerHeight.value / props.itemHeight) + props.overscan * 2;
  const end = Math.min(lines.value.length, start + visibleCount);
  return { start, end };
});

const visibleLines = computed(() => {
  const { start, end } = visibleRange.value;
  return lines.value
    .slice(start, end)
    .map((text, i) => ({
      index: start + i,
      text,
      style: {
        position: "absolute" as const,
        top: `${(start + i) * props.itemHeight}px`,
        height: `${props.itemHeight}px`
      }
    }));
});

function handleScroll(e: Event) {
  const target = e.target as HTMLElement;
  scrollTop.value = target.scrollTop;
}

onMounted(() => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
    new ResizeObserver((entries) => {
      containerHeight.value = entries[0].contentRect.height;
    }).observe(containerRef.value);
  }
});
</script>

<template>
  <div
    ref="containerRef"
    class="virtual-editor"
    @scroll="handleScroll"
  >
    <!-- 占位区域 -->
    <div class="virtual-editor__spacer" :style="{ height: `${totalHeight}px` }">
      <!-- 实际渲染的行 -->
      <div
        v-for="line in visibleLines"
        :key="line.index"
        class="virtual-editor__line"
        :style="line.style"
      >
        {{ line.text || "\u00A0" }}
      </div>
    </div>
  </div>
</template>
```

### 6.3 增量解析优化

```typescript
// apps/admin/src/utils/incrementalParser.ts

interface ParseChunk {
  start: number;
  end: number;
  node: HTMLElement;
}

export class IncrementalDOMParser {
  private observer: MutationObserver | null = null;
  private pendingUpdates: Map<string, ParseChunk> = new Map();

  observe(root: HTMLElement, callback: (chunks: ParseChunk[]) => void) {
    this.observer = new MutationObserver((mutations) => {
      const chunks: ParseChunk[] = [];

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              chunks.push({
                start: this.getNodeOffset(root, node),
                end: this.getNodeOffset(root, node) + this.estimateSize(node),
                node
              });
            }
          });
        }
      }

      if (chunks.length > 0) {
        callback(chunks);
      }
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  disconnect() {
    this.observer?.disconnect();
    this.observer = null;
  }

  private getNodeOffset(root: HTMLElement, node: HTMLElement): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let current: Node | null = walker.nextNode();

    while (current && current !== node) {
      offset += (current.textContent || "").length;
      current = walker.nextNode();
    }

    return offset;
  }

  private estimateSize(node: HTMLElement): number {
    return (node.textContent || "").length;
  }
}
```

---

## 7. 实现计划

### 阶段一：基础颜色功能（1-2 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 创建 ColorPicker 组件 | `components/editor/ColorPicker.vue` | ✅ |
| 创建颜色选择器样式 | `components/editor/color-picker.css` | ✅ |
| 集成到 EditorToolbar | `components/editor/EditorToolbar.vue` | ✅ |
| 单元测试 | `__tests__/ColorPicker.spec.ts` | ✅ |

### 阶段二：批注系统（2-3 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 创建 Annotation 扩展 | `components/editor/AnnotationExtension.ts` | ✅ |
| 创建批注侧边栏组件 | `components/editor/AnnotationSidebar.vue` | ✅ |
| 集成批注 UI | `components/editor/ChendocEditor.vue` | ✅ |
| 批注 CRUD 操作 | `composables/useAnnotation.ts` | ✅ |
| 单元测试 | `__tests__/Annotation.spec.ts` | ✅ |

### 阶段三：移动端优化（1 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 移动端编辑器 composable | `composables/useMobileEditor.ts` | ✅ |
| 触控手势支持 | - | ✅ |
| 响应式工具栏优化 | `editor-toolbar.css` | ✅ |

### 阶段四：性能优化（1-2 天）

| 任务 | 文件 | 产出 |
|------|------|------|
| 虚拟列表组件 | `components/editor/VirtualEditor.vue` | ✅ |
| 增量解析器 | `utils/incrementalParser.ts` | ✅ |
| 大文档测试 | `__tests__/perf/large-doc.spec.ts` | ✅ |

---

## 8. 技术约束

- **TipTap 兼容性**：确保扩展与 TipTap 3.7.x 兼容
- **深色模式**：ColorPicker 和批注样式需支持 `data-theme="dark"`
- **无障碍**：颜色选择器需支持键盘导航和 ARIA 标签
- **可访问性**：批注系统需支持屏幕阅读器

---

## 9. 测试计划

| 测试类型 | 覆盖场景 |
|----------|----------|
| 单元测试 | ColorPicker 交互、Annotation 扩展命令 |
| 集成测试 | 编辑器内颜色/批注功能 |
| 视觉回归 | 深色模式下的颜色选择器 |
| 性能测试 | 10 万字文档的渲染和交互延迟 |
| 移动端测试 | iOS Safari、Android Chrome 触控 |
