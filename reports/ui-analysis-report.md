# ChenDoc UI 现状分析报告

**产出时间**: 2026-06-30
**分析范围**: `apps/admin/src` — Vue 组件与 CSS 文件
**分析维度**: 视觉一致性、响应式适配、无障碍、交互体验、组件复用、暗色模式

---

## 一、视觉一致性问题

### P0 硬编码颜色未使用 CSS 变量（高优先级）

doc-list.css 中大量使用十六进制硬编码色值，未走 variables.css 变量系统：

| 行号 | 硬编码值 | 应替换为 |
|------|----------|----------|
| 12, 18, 84, 166, 173, 256, 268, 276 | `#fff` | `var(--cd-bg)` |
| 12, 46, 100, 116, 229, 645, 695, 696, 713, 757 | `#f5f6f8`, `#f0f2f5`, `#e8eaed` | `var(--cd-paper-soft)` |
| 71, 112, 152, 205, 272, 696 | `#fff` (文字/背景) | `var(--cd-bg)` |
| 257, 260, 278, 696 | `#fff` | `var(--cd-bg)` |
| 455 | `rgba(37, 99, 235, 0.28)` | `var(--cd-accent-soft)` |
| 604 | `rgba(5, 150, 105, 0.18)` | `var(--cd-brand-accent-soft)` |
| 640, 641 | `#fff`, `#e8eaed` | CSS 变量 |

**影响**: 暗黑模式切换时页面颜色错乱，用户体验割裂。

### P1 字号/行高不统一

- doc-list.css: `font-weight: 760` (行 443) — 数值超出 CSS 有效范围（1-900），应改为 `font-weight: 700`
- 移动端/桌面端字号层级较多: 11px/12px/13px/14px/15px/16px/18px/26px/36px，建议收敛为 3-4 档

### P1 阴影/圆角变量未统一

- doc-list.css 多处使用硬编码阴影: `rgba(0, 0, 0, 0.06)`, `rgba(0, 0, 0, 0.04)`, `rgba(37, 99, 235, 0.15)`
- 建议统一使用 `--cd-shadow-card`, `--cd-shadow-soft` 等已定义变量

---

## 二、响应式适配问题

### P1 断点不统一

| 文件 | 断点 | 问题 |
|------|------|------|
| app-sidebar.css | 900px | 侧边栏切换 |
| doc-list.css | 760px, 900px, 1180px, 1360px | 文档列表 |
| login.css | 480px | 登录页 |

**建议**: 收敛为 2-3 个主断点（如 768px / 1024px / 1440px），避免碎片化。

### P1 移动端固定工具栏层级

doc-list.css 行 699: `z-index: 100` 与其他组件层级可能冲突，建议统一在 variables.css 定义层级变量。

---

## 三、无障碍（Accessibility）问题

### P0 ARIA 标签缺失（P0）

| 文件 | 问题 |
|------|------|
| DocListPage.vue | 部分按钮缺少 `aria-label`，筛选/排序操作无标签 |
| SettingsPage.vue | 表格内操作按钮缺少 `aria-label` |
| TrashPage.vue | 恢复/永久删除按钮缺少 `aria-label` |

**建议**: 所有 icon-only 按钮必须添加 `aria-label="操作描述"`。

### P1 键盘导航不完整

- DocListPage.vue: 列表行可通过 Tab 聚焦，但 Enter 键操作未明确 `role` 绑定
- 批量选择后键盘快捷键（如 `Delete`）未实现 `aria-describedby` 说明

### P1 Focus 样式覆盖

base.css 行 78-87 定义了 `focus-visible` 样式，但 doc-list.css 行 528 的 `.doc-list-page__row` transition 未包含 `outline`，可能导致键盘用户丢失焦点指示。

### P2 `role` 属性一致性

- DocListPage.vue: `role="tablist"` / `role="tab"` / `role="tabpanel"` 已正确实现 ✓
- MobileAppShell.vue: `role="dialog"` / `aria-modal="true"` 已正确实现 ✓
- 但部分动态内容区域缺少 `aria-live="polite"` 通知

---

## 四、交互体验问题

### P1 动画/过渡不一致

- doc-list.css 行 107, 177: `transition: all 0.2s ease`（非标准写法，应为 `transition-duration`）
- 行 528: `transition: border-color 140ms ease-out ...` (140ms)
- 行 368: `transition: background-color 140ms ease-out ...` (140ms)
- base.css 行 43: `transition: ... 140ms ease-out`

**建议**: 统一过渡时长为 150ms，使用 `cubic-bezier(0.4, 0, 0.2, 1)` 或 `ease-out`。

### P1 移动端点击反馈

doc-list.css 行 180-183:
```css
.doc-list-page__mobile-card:active {
  transform: scale(0.98);
}
```
**问题**: `prefers-reduced-motion` 用户无此效果，但基础 `.cd-button` 的 `prefers-reduced-motion` 覆盖写法见 base.css 行 154-159，但 doc-list.css 移动端样式未覆盖。

### P2 加载骨架屏动画

base.css 行 146-152 定义了骨架屏 pulse 动画，已正确支持 `prefers-reduced-motion`。但 doc-list.css 的骨架屏样式未与 base.css 组件对齐。

---

## 五、组件复用问题

### P1 重复样式定义

- `.cd-card`, `.cd-skeleton`, `.cd-button` 已在 base.css 定义，但 doc-list.css 中部分 `.doc-list-page__*` 样式重复了相似的视觉模式
- 建议: 将 doc-list.css 中的通用卡片行结构抽取为 `.cd-list-row` / `.cd-list-card` 组件

### P2 CSS 类命名 BEM 不一致

| 文件 | 模式 | 说明 |
|------|------|------|
| app-sidebar.css | BEM 正确: `app-sidebar__brand--modifier` | ✓ |
| doc-list.css | 混合: `is-collapsed` / `is-active` / `is-selected` / `is-bulk` | 建议统一为 `is-*` 前缀 |
| base.css | 组件级: `.cd-*` 前缀 | ✓ |

---

## 六、暗色模式问题

### P0 硬编码颜色导致暗色模式失效

**这是最严重的问题。** doc-list.css 中大量 `#fff`, `#f5f6f8`, `#f0f2f5`, `#e8eaed` 在 `[data-theme="dark"]` 下变成刺眼亮色，与 variables.css 定义的深色背景（`--cd-bg: #0a0a0a`, `--cd-paper-soft: #2a2a2a`）形成强烈对比。

**影响范围**:
- doc-list-page 移动端 Hero (行 18)
- 移动端搜索框背景 (行 46)
- 移动端 Tab 按钮 (行 100)
- 移动端卡片背景 (行 173)
- 移动端骨架屏 (行 258)
- 固定底部工具栏 (行 696-697)
- 桌面端 hover 行 (行 573)

### P1 暗色模式未覆盖的阴影

暗色模式下 `rgba(0, 0, 0, 0.06)` 类阴影在深色背景上不可见，应改用 `rgba(255, 255, 255, 0.05)` 或定义专用变量。

### P1 暗色模式未覆盖的边框

部分使用 `#e8eaed` 的边框在暗色模式下过亮，建议使用 `var(--cd-border-strong)`。

---

## 七、优先级建议汇总

### P0 — 必须修复（影响核心体验/无障碍）

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 1 | 硬编码颜色未使用 CSS 变量 | doc-list.css | 12, 18, 46, 71, 84, 100, 112, 152, 166, 173, 205, 229, 256, 268, 272, 276, 455, 573, 604, 640-641, 645, 695-698, 713, 730, 745, 757, 760 |
| 2 | ARIA 标签缺失 | DocListPage.vue, SettingsPage.vue, TrashPage.vue | — |
| 3 | 暗黑模式颜色错乱 | doc-list.css | 全部移动端样式 |

### P1 — 高优先级（影响一致性和可用性）

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 4 | font-weight 超出有效范围 | doc-list.css | 443 |
| 5 | 断点不统一 | app-sidebar.css, doc-list.css | 多处 |
| 6 | 过渡动画时长不一致 | doc-list.css, base.css | 107, 177, 368, 443 |
| 7 | 移动端 z-index 层级 | doc-list.css | 699 |
| 8 | 键盘导航焦点样式 | DocListPage.vue | — |
| 9 | icon-only 按钮无 aria-label | 多个 Vue 组件 | — |

### P2 — 中优先级（改进建议）

| # | 问题 | 文件 |
|---|------|------|
| 10 | 字号层级过多 | doc-list.css |
| 11 | CSS 类命名不一致 | doc-list.css |
| 12 | 重复样式未抽取为组件 | doc-list.css |
| 13 | prefers-reduced-motion 覆盖不完整 | doc-list.css |
| 14 | aria-live 通知区域缺失 | DocListPage.vue |

---

## 八、修复建议

1. **建立 CSS 变量映射表**: 将 doc-list.css 中的所有硬编码颜色映射到 variables.css 变量
2. **创建暗色模式覆盖层**: 在 variables.css 中添加 `[data-theme="dark"]` 专用辅助色
3. **统一断点系统**: 在 variables.css 中定义 `--cd-breakpoint-sm/md/lg`，所有文件引用
4. **组件化**: 将 `.doc-list-page__row` / `__mobile-card` 抽取为可复用 Vue 组件
5. **无障碍审计工具**: 建议集成 `eslint-plugin-jsx-a11y` 或 `vite-plugin-a11y` 到构建流程

---

*报告由 UX Researcher 角色产出 | ChenDoc 项目*
