# ChenDoc 深色模式实现方案

## 1. 概述

本方案为 ChenDoc 实现完整的深色模式支持，包括 CSS 变量主题系统、主题切换组件、全局样式适配、编辑器深色主题和响应式适配。

## 2. 现有基础设施

### 2.1 已有组件

| 组件 | 位置 | 状态 |
|------|------|------|
| theme store | `stores/theme.ts` | ✅ 基础实现完成 |
| CSS 变量文件 | `styles/variables.css` | ⚠️ 仅浅色主题 |
| 样式重置 | `styles/reset.css` | ✅ 跨主题兼容 |
| 基础样式 | `styles/base.css` | ⚠️ 使用 CSS 变量但无深色覆盖 |

### 2.2 现有 theme store 功能

```typescript
// stores/theme.ts
type Theme = "light" | "dark" | "system";

// 功能：
- localStorage 持久化 (chendoc_theme)
- 系统偏好监听 (prefers-color-scheme)
- applyTheme() 设置 data-theme 属性
- setTheme() / toggleTheme()
```

## 3. CSS 变量主题系统设计

### 3.1 变量文件结构

```
styles/
├── variables.css       # 浅色主题变量（默认）
├── variables.dark.css  # 深色主题变量覆盖
└── themes.css          # 主题选择器与切换逻辑
```

### 3.2 深色主题变量 (variables.dark.css)

```css
[data-theme="dark"] {
  /* 表面颜色 - 深色背景 */
  --cd-bg: #0f1117;
  --cd-bg-plain: #161921;
  --cd-surface: #1c1f2b;
  --cd-panel: #222637;
  --cd-paper: #2a2f42;
  --cd-paper-soft: #1c1f2b;

  /* 文字颜色 - 高对比度 */
  --cd-ink: #e8eaed;
  --cd-text: #d1d5db;
  --cd-text-secondary: #9ca3af;

  /* 边框 - 更柔和的分割线 */
  --cd-border: #2d3348;
  --cd-border-strong: #3d4562;

  /* 辅助文字色 */
  --cd-muted: #8b95a8;
  --cd-faint: #6b7280;

  /* 主色调 - 调整饱和度适配深色 */
  --cd-primary: #3b82f6;
  --cd-primary-hover: #60a5fa;
  --cd-primary-soft: #1e3a5f;

  /* 品牌绿 - 适配深色 */
  --cd-brand-accent: #10b981;
  --cd-brand-accent-soft: #064e3b;

  /* 紫罗兰色系 */
  --cd-aura: #1e1b4b;
  --cd-aura-strong: #a78bfa;
  --cd-lilac: #1e1b4b;

  /* 功能色 - 保持辨识度 */
  --cd-danger: #ef4444;
  --cd-danger-soft: #450a0a;
  --cd-warning: #f59e0b;
  --cd-success: #10b981;
  --cd-success-soft: #064e3b;

  /* 阴影 - 适合深色的发光效果 */
  --cd-shadow: 0 20px 44px rgba(0, 0, 0, 0.5);
  --cd-shadow-soft: 0 2px 8px rgba(0, 0, 0, 0.3);
  --cd-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.25);

  /* 焦点样式 - 更明显的边框 */
  --cd-focus: rgba(59, 130, 246, 0.35);
}
```

### 3.3 主题加载机制

在 `main.ts` 中加载主题文件：

```typescript
// main.ts
import "./styles/variables.css";
import "./styles/variables.dark.css"; // 深色变量覆盖
import "./styles/themes.css";          // 主题切换逻辑
```

## 4. 深色/浅色主题切换组件

### 4.1 ThemeToggle 组件设计

**位置**: `components/common/ThemeToggle.vue`

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useThemeStore } from "../../stores/theme";
import { Moon, Sun, Monitor } from "lucide-vue-next";

const themeStore = useThemeStore();

const themeIcon = computed(() => {
  if (themeStore.theme === "dark") return Moon;
  if (themeStore.theme === "light") return Sun;
  return Monitor;
});

const themeLabel = computed(() => {
  if (themeStore.theme === "dark") return "深色模式";
  if (themeStore.theme === "light") return "浅色模式";
  return "跟随系统";
});

function cycleTheme() {
  const themes: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
  const currentIndex = themes.indexOf(themeStore.theme);
  const nextIndex = (currentIndex + 1) % themes.length;
  themeStore.setTheme(themes[nextIndex]);
}
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="themeLabel"
    :title="themeLabel"
    @click="cycleTheme"
  >
    <component :is="themeIcon" :size="18" />
  </button>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: var(--cd-panel);
  color: var(--cd-text);
  cursor: pointer;
  transition: all 140ms ease-out;
}

.theme-toggle:hover {
  background: var(--cd-primary-soft);
  border-color: var(--cd-primary);
  color: var(--cd-primary);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--cd-focus);
  outline-offset: 2px;
}
</style>
```

### 4.2 集成到 Header

在 `AppHeader.vue` 中添加主题切换按钮：

```vue
<!-- AppHeader.vue -->
<template>
  <header class="app-header">
    <!-- ... 其他内容 ... -->
    <div class="app-header__actions">
      <!-- 在帮助按钮前添加 -->
      <ThemeToggle />
      <!-- 原有按钮 -->
    </div>
  </header>
</template>

<script setup>
import ThemeToggle from "../../components/common/ThemeToggle.vue";
// ...
</script>
```

## 5. 全局样式适配

### 5.1 避免闪烁 (FOUC)

在 `index.html` 的 `<head>` 中添加内联脚本：

```html
<script>
  (function() {
    const theme = localStorage.getItem('chendoc_theme') || 'system';
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = theme;
    }
  })();
</script>
```

### 5.2 base.css 深色适配

在现有 `base.css` 中添加深色模式覆盖：

```css
/* 深色模式下的搜索高亮 */
[data-theme="dark"] mark {
  background: #854d0e;
  color: #fef3c7;
}

/* 深色模式下的 Skeleton 动画 */
[data-theme="dark"] .cd-skeleton {
  background: linear-gradient(90deg, #2d3348, #3d4562, #2d3348);
  background-size: 200% 100%;
}

/* 深色模式下的 Selection */
[data-theme="dark"] ::selection {
  background: rgba(59, 130, 246, 0.35);
  color: #e8eaed;
}
```

### 5.3 组件样式适配清单

| 文件 | 需要适配的内容 |
|------|---------------|
| `app-header.css` | 背景色、图标颜色、边框 |
| `app-sidebar.css` | 背景色、hover 状态、选中态 |
| `mobile-app-shell.css` | 导航栏背景色 |
| `session-status-banner.css` | 背景色、文本色 |
| `settings.css` | 面板背景、表格样式 |

## 6. 编辑器深色主题支持

### 6.1 TipTap 编辑器主题

在 `editor-runtime.ts` 中添加深色主题配置：

```typescript
// editor-runtime.ts
import { useThemeStore } from "../../stores/theme";

function getEditorTheme() {
  const themeStore = useThemeStore();
  const isDark = document.documentElement.dataset.theme === "dark";

  return isDark ? "dark" : "light";
}
```

### 6.2 编辑器内容区样式

在 `chendoc-editor.css` 中添加：

```css
.chendoc-editor__surface {
  /* 浅色主题 */
  background: var(--cd-surface);
  color: var(--cd-text);
}

[data-theme="dark"] .chendoc-editor__surface {
  background: #161921;
  color: #d1d5db;
}

[data-theme="dark"] .chendoc-editor__surface h1,
[data-theme="dark"] .chendoc-editor__surface h2,
[data-theme="dark"] .chendoc-editor__surface h3 {
  color: #e8eaed;
}

[data-theme="dark"] .chendoc-editor__surface blockquote {
  background: var(--cd-paper);
  border-left-color: var(--cd-primary);
}

[data-theme="dark"] .chendoc-editor__surface pre {
  background: #1e1e1e;
  color: #d4d4d4;
}
```

### 6.3 highlight.js 深色主题

使用 `highlight.js` 内置的深色主题（如 `atom-one-dark`）：

```typescript
// editor-runtime.ts
import atomOneDark from "highlight.js/styles/atom-one-dark.css?inline";
import defaultLight from "highlight.js/styles/github.css?inline";

function injectHighlightTheme(isDark: boolean) {
  const id = "hljs-theme";
  let existing = document.getElementById(id);
  if (!existing) {
    existing = document.createElement("style");
    existing.id = id;
    document.head.appendChild(existing);
  }
  existing.textContent = isDark ? atomOneDark : defaultLight;
}
```

## 7. 响应式适配

### 7.1 移动端主题切换

在移动端侧边栏中添加主题切换：

```vue
<!-- MobileAppShell.vue -->
<template>
  <nav class="mobile-nav">
    <!-- ... 其他导航项 ... -->
    <div class="mobile-nav__section">
      <span>外观</span>
      <ThemeToggle />
    </div>
  </nav>
</template>
```

### 7.2 触摸设备优化

深色模式减少 OLED 屏幕功耗，同时降低移动端眼睛疲劳：

```css
@media (prefers-color-scheme: dark) {
  /* 自动跟随系统的深色优化 */
  [data-theme="system"] {
    /* 系统为深色时应用的样式 */
  }
}
```

## 8. 实现计划

### 阶段一：CSS 变量系统

- [ ] 创建 `variables.dark.css` 深色变量文件
- [ ] 创建 `themes.css` 主题切换逻辑
- [ ] 更新 `main.ts` 导入顺序
- [ ] 添加防闪烁内联脚本到 `index.html`

### 阶段二：组件实现

- [ ] 创建 `ThemeToggle.vue` 组件
- [ ] 集成到 `AppHeader.vue`
- [ ] 集成到移动端侧边栏

### 阶段三：全局适配

- [ ] 适配 `base.css` 深色样式
- [ ] 适配 `app-header.css`
- [ ] 适配 `app-sidebar.css`
- [ ] 适配其他布局组件

### 阶段四：编辑器深色主题

- [ ] 添加编辑器内容区深色样式
- [ ] 实现 highlight.js 主题动态切换
- [ ] 测试代码块、引用等元素的深色显示

### 阶段五：测试与优化

- [ ] 桌面端/移动端响应式测试
- [ ] 系统偏好跟随功能测试
- [ ] 主题切换无闪烁验证
- [ ] 可访问性检查（对比度、焦点状态）

## 9. 技术要点

### 9.1 CSS 变量覆盖策略

使用 `[data-theme="dark"]` 选择器覆盖浅色变量，无需复制所有样式。

### 9.2 性能优化

- 深色变量文件仅包含变量定义，体积小
- highlight.js 主题按需加载
- 主题切换使用 CSS 变量，无重绘开销

### 9.3 可访问性

- 所有颜色对比度符合 WCAG AA 标准
- 深色模式下焦点状态更明显
- 支持 `prefers-reduced-motion`

## 10. 文件清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `apps/admin/src/styles/variables.dark.css` |
| 新建 | `apps/admin/src/styles/themes.css` |
| 新建 | `apps/admin/src/components/common/ThemeToggle.vue` |
| 修改 | `apps/admin/index.html` |
| 修改 | `apps/admin/src/main.ts` |
| 修改 | `apps/admin/src/styles/base.css` |
| 修改 | `apps/admin/src/components/layout/AppHeader.vue` |
| 修改 | `apps/admin/src/components/layout/MobileAppShell.vue` |
| 修改 | `apps/admin/src/components/layout/app-header.css` |
| 修改 | `apps/admin/src/components/layout/app-sidebar.css` |
| 修改 | `apps/admin/src/components/editor/chendoc-editor.css` |
| 修改 | `apps/admin/src/components/editor/editor-runtime.ts` |

---

*文档版本: 1.0*
*创建日期: 2026-07-01*
