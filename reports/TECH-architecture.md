# ChenDoc 全量重构技术架构设计

> 版本：v3.0.0（架构重大升级）
> 日期：2026-07-01
> 作者：架构师
> 状态：初稿

---

## 目录

1. [深色模式实现方案](#1-深色模式实现方案)
2. [TipTap 编辑器升级方案](#2-tiptap-编辑器升级方案)
3. [增强标签系统数据模型](#3-增强标签系统数据模型)
4. [看板视图数据模型与状态管理](#4-看板视图数据模型与状态管理)
5. [PDFWord-导出技术选型](#5-pdfword-导出技术选型)
6. [文档评论批注系统设计](#6-文档评论批注系统设计)
7. [全文搜索优化方案](#7-全文搜索优化方案)
8. [大文档性能优化](#8-大文档性能优化)
9. [定时发布草稿过期机制](#9-定时发布草稿过期机制)
10. [开放-API-版本设计](#10-开放-api-版本设计)

---

## 1. 深色模式实现方案

### 1.1 现状分析

当前 ChenDoc 使用 `data-theme` 属性 + CSS 变量体系，已有基础实现：

```css
/* apps/admin/src/styles/variables.css */
:root {
  --cd-bg: #f5f6f8;
  --cd-surface: #ffffff;
  --cd-ink: #0f172a;
  /* ... */
}
```

主题状态由 `stores/theme.ts` 管理，支持 `light | dark | system` 三种模式。

### 1.2 目标

- 平滑主题切换（无闪烁）
- 支持更多色彩模式（跟随系统、高对比度）
- 暗色模式精细化调优
- 媒体资源（图片、图标）适配

### 1.3 推荐方案：CSS 变量 + 系统级适配

#### 方案 A：纯 CSS 变量方案（推荐）

```
优点：
- 实现简单，无运行时开销
- 主题切换无闪烁（CSS 优先加载）
- 维护成本低

缺点：
- 需要重构现有变量体系
```

**实现要点：**

```css
/* 亮色主题（默认） */
:root,
[data-theme="light"] {
  --cd-bg: #f5f6f8;
  --cd-surface: #ffffff;
  --cd-ink: #0f172a;
  --cd-text: #1d2939;
  --cd-border: #e8eaed;
  --cd-primary: #2563eb;
  /* 阴影适配暗色 */
  --cd-shadow: 0 20px 44px rgba(15, 23, 42, 0.14);
  --cd-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 暗色主题 */
[data-theme="dark"] {
  --cd-bg: #0f1117;
  --cd-surface: #1a1d27;
  --cd-panel: #232836;
  --cd-paper: #1e222d;
  --cd-paper-soft: #262b38;
  --cd-ink: #f1f5f9;
  --cd-text: #e2e8f0;
  --cd-text-secondary: #94a3b8;
  --cd-border: #2d3548;
  --cd-border-strong: #3d4760;
  --cd-muted: #64748b;
  --cd-faint: #7c8ba1;
  --cd-primary: #3b82f6;
  --cd-primary-hover: #60a5fa;
  --cd-primary-soft: rgba(59, 130, 246, 0.15);
  /* 暗色阴影更柔和 */
  --cd-shadow: 0 20px 44px rgba(0, 0, 0, 0.4);
  --cd-shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* 高对比度模式 */
[data-theme="high-contrast"] {
  --cd-bg: #000000;
  --cd-surface: #000000;
  --cd-ink: #ffffff;
  --cd-text: #ffffff;
  --cd-border: #ffffff;
  --cd-primary: #00bfff;
}
```

**无闪烁切换实现：**

在 `index.html` 的 `<head>` 中添加阻塞脚本：

```html
<script>
  // 阻塞执行，防止 FOUC
  (function() {
    const stored = localStorage.getItem('chendoc_theme');
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = stored || system;
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

#### 方案 B：CSS 变量 + CSS Color Scheme（备选）

利用 `color-scheme` 属性让浏览器原生适配表单元素：

```css
:root {
  color-scheme: light dark;
}
```

#### 方案 C：TailwindCSS 暗黑模式（不推荐）

当前项目使用纯 CSS，无需引入 TailwindCSS 体系。

### 1.4 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 新增暗色变量，覆盖全部 `--cd-*` 变量 | 1天 |
| Phase 2 | 验证所有页面组件暗色表现 | 2天 |
| Phase 3 | 优化过渡动画、焦点样式 | 1天 |
| Phase 4 | 高对比度模式（可选） | 1天 |

### 1.5 风险与回滚

- **风险**：图标颜色未适配暗色
- **回滚**：保留 `data-theme="light"` 回退路径

---

## 2. TipTap 编辑器升级方案

### 2.1 现状分析

当前使用 TipTap v3.7.2，集成扩展：

- StarterKit、Link、Placeholder、Underline
- TaskList/TaskItem（嵌套待办）
- Table 系列（可调整列宽）
- TextStyle、FontFamily、Color、Highlight
- CodeBlockLowlight（30+ 语言高亮）
- ChendocImage、Video（自定义扩展）

### 2.2 目标

- 颜色选择器集成
- 高亮批注功能（协作编辑基础）
- 更丰富的浮动工具栏
- 块级元素拖拽排序

### 2.3 推荐方案

#### 2.3.1 颜色选择器

**推荐库：** `@uiw/react-color` 或原生 `<input type="color">` 封装

```typescript
// 新增 TipTap Mark 扩展
import { Mark, mergeAttributes } from '@tiptap/core';

export const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => element.style.color || null,
        renderHTML: attributes => {
          if (!attributes.color) return {};
          return { style: `color: ${attributes.color}` };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[style*="color"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});
```

**UI 实现：**

```vue
<!-- EditorToolbar.vue 新增 -->
<template>
  <div class="toolbar-group">
    <button @click="toggleColorPicker" title="文字颜色">
      <span class="color-preview" :style="{ background: currentColor }" />
    </button>
    <div v-if="colorPickerOpen" class="color-picker-popup">
      <input type="color" v-model="currentColor" @change="applyColor" />
      <div class="preset-colors">
        <button v-for="c in presetColors" :key="c" 
          :style="{ background: c }" @click="applyColor(c)" />
      </div>
    </div>
  </div>
</template>
```

#### 2.3.2 高亮批注

**TipTap Comment Mark：**

```typescript
export const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return {
      commentId: { default: null },
      author: { default: null },
      createdAt: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-comment': '' }, HTMLAttributes), 0];
  },
});
```

**数据结构：**

```typescript
interface Comment {
  id: string;
  docUid: string;
  anchorMarkId: string;  // 关联的 Mark ID
  authorId: number;
  authorName: string;
  content: string;
  resolved: boolean;
  createdAt: Date;
  replies?: CommentReply[];
}
```

#### 2.3.3 块级拖拽

使用 `@tiptap/extension-drag-handle` 或自定义实现：

```typescript
import { DragHandle } from '@tiptap/extension-drag-handle';

const editor = new Editor({
  extensions: [
    // ...现有扩展
    DragHandle.configure({
      types: ['heading', 'paragraph', 'image', 'codeBlock'],
    }),
  ],
});
```

### 2.4 迁移路径

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 新增 TextColor Mark 扩展 + 颜色选择器 UI | 后端评论 API |
| Phase 2 | CommentMark + 批注侧边栏 | Phase 1 |
| Phase 3 | 块级拖拽集成 | TipTap 兼容性测试 |
| Phase 4 | 浮动工具栏（选中文本时显示） | Phase 1 |

### 2.5 风险与回滚

- **风险**：TipTap 升级可能破坏现有扩展
- **回滚**：锁定 v3.7.2 版本，逐步升级小版本

---

## 3. 增强标签系统数据模型

### 3.1 现状分析

当前标签结构：

```typescript
// apps/admin/src/api/tags.ts
interface Tag {
  id: number;
  name: string;
  color: string;
  ownerId: number;
  docCount: number;
  createdAt: string;
}
```

数据库结构：

```sql
-- server/src/db/schema.sqlite.ts
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "cascade" }),
  docCount: integer("doc_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  nameOwnerUnique: uniqueIndex("uk_tags_name_owner").on(table.name, table.ownerId),
  ownerIdx: index("tags_owner_idx").on(table.ownerId)
}));
```

### 3.2 目标

- 多级标签（父子层级）
- 标签图标/emoji 支持
- 标签分组
- 智能推荐

### 3.3 推荐方案

#### 3.3.1 数据模型设计

**新增表：`tag_groups`（标签分组）**

```sql
CREATE TABLE tag_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,  -- emoji 或图标名
  color TEXT NOT NULL DEFAULT '#6b7280',
  sort INTEGER NOT NULL DEFAULT 0,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(name, owner_id)
);

CREATE INDEX tag_groups_owner_idx ON tag_groups(owner_id);
```

**修改表：`tags`**

```sql
ALTER TABLE tags ADD COLUMN parent_id INTEGER REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE tags ADD COLUMN group_id INTEGER REFERENCES tag_groups(id) ON DELETE SET NULL;
ALTER TABLE tags ADD COLUMN icon TEXT;  -- emoji
ALTER TABLE tags ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN description TEXT;
```

**新类型：`tag_documents`（文档-标签关联）**

```sql
-- 从 docs.tags JSON 迁移为关联表
CREATE TABLE tag_documents (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tag_id, doc_id)
);

CREATE INDEX tag_documents_doc_idx ON tag_documents(doc_id);
```

#### 3.3.2 TypeScript 类型

```typescript
// apps/admin/src/api/tags.ts
export interface TagGroup {
  id: number;
  name: string;
  icon?: string;
  color: string;
  sort: number;
  ownerId: number;
  createdAt: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  parentId?: number;    // 父标签 ID（多级）
  groupId?: number;     // 所属分组
  sort: number;
  docCount: number;
  ownerId: number;
  createdAt: string;
  children?: Tag[];     // 嵌套子标签（仅前端展示用）
}

export interface TagTree {
  groups: TagGroup[];
  tags: Tag[];
  tree: (Tag | TagGroup)[];  // 扁平化树结构
}
```

#### 3.3.3 API 设计

```
GET    /api/tags/tree              # 获取标签树结构
POST   /api/tags/groups            # 创建分组
PATCH  /api/tags/groups/:id        # 更新分组
DELETE /api/tags/groups/:id        # 删除分组（级联标签）
POST   /api/tags                   # 创建标签（支持 parentId、groupId）
PATCH  /api/tags/:id               # 更新标签
DELETE /api/tags/:id               # 删除标签
POST   /api/tags/:id/move          # 移动标签（跨组、跨父）
GET    /api/tags/suggestions       # 智能推荐（基于文档内容）
```

#### 3.3.4 迁移策略

```typescript
// server/src/db/migrations/v3_add_enhanced_tags.ts
export async function up(db: Database) {
  // 1. 创建 tag_groups 表
  await db.execute(sql`
    CREATE TABLE tag_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT NOT NULL DEFAULT '#6b7280',
      sort INTEGER NOT NULL DEFAULT 0,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(name, owner_id)
    )
  `);

  // 2. 修改 tags 表
  await db.execute(sql`ALTER TABLE tags ADD COLUMN parent_id INTEGER`);
  await db.execute(sql`ALTER TABLE tags ADD COLUMN group_id INTEGER`);
  await db.execute(sql`ALTER TABLE tags ADD COLUMN icon TEXT`);
  await db.execute(sql`ALTER TABLE tags ADD COLUMN sort INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE tags ADD COLUMN description TEXT`);

  // 3. 创建 tag_documents 关联表
  await db.execute(sql`
    CREATE TABLE tag_documents (
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (tag_id, doc_id)
    )
  `);

  // 4. 迁移现有数据（docs.tags JSON → tag_documents）
  // 5. 移除 docs.tags 列（或保留用于向后兼容）
}
```

### 3.4 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 创建 tag_groups 表，添加 tags 新字段 | 1天 |
| Phase 2 | 创建 tag_documents 关联表，迁移数据 | 2天 |
| Phase 3 | 实现标签树 API | 1天 |
| Phase 4 | 前端标签管理 UI 重构 | 3天 |
| Phase 5 | 智能推荐功能 | 2天 |

### 3.5 风险与回滚

- **风险**：文档标签迁移失败导致数据丢失
- **回滚**：保留 `docs.tags` JSON 列作为备份

---

## 4. 看板视图数据模型与状态管理

### 4.1 需求分析

用户需要将文档组织为看板视图，支持：
- 自定义列（状态/优先级/项目阶段）
- 卡片式文档展示
- 拖拽排序
- 筛选与搜索

### 4.2 推荐方案

#### 4.2.1 数据模型

**新增表：`kanban_boards`**

```sql
CREATE TABLE kanban_boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**新增表：`kanban_columns`**

```sql
CREATE TABLE kanban_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  sort INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,  -- WIP 限制（可选）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**新增表：`kanban_cards`（文档看板关联）**

```sql
CREATE TABLE kanban_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  column_id INTEGER NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(column_id, doc_id)
);
```

#### 4.2.2 TypeScript 类型

```typescript
export interface KanbanBoard {
  id: number;
  name: string;
  description?: string;
  ownerId: number;
  isDefault: boolean;
  columns: KanbanColumn[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: number;
  boardId: number;
  name: string;
  color: string;
  sort: number;
  wipLimit?: number;
  cards: KanbanCard[];
}

export interface KanbanCard {
  id: number;
  columnId: number;
  docId: number;
  sort: number;
  // 文档基本信息（冗余存储，加速查询）
  docUid: string;
  title: string;
  summary?: string;
  coverUrl?: string;
  tags: string[];
  updatedAt: Date;
}
```

#### 4.2.3 状态管理

```typescript
// stores/kanban.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useKanbanStore = defineStore('kanban', () => {
  // 状态
  const boards = ref<KanbanBoard[]>([]);
  const currentBoardId = ref<number | null>(null);
  const loading = ref(false);
  const dragState = ref<{
    cardId: number;
    fromColumnId: number;
    toColumnId: number;
    newSort: number;
  } | null>(null);

  // 计算属性
  const currentBoard = computed(() =>
    boards.value.find(b => b.id === currentBoardId.value)
  );

  const currentColumns = computed(() =>
    currentBoard.value?.columns.sort((a, b) => a.sort - b.sort) ?? []
  );

  // 操作
  async function loadBoards() {
    loading.value = true;
    try {
      boards.value = await fetchKanbanBoards();
    } finally {
      loading.value = false;
    }
  }

  async function moveCard(cardId: number, toColumnId: number, newSort: number) {
    // 乐观更新
    const card = findCard(cardId);
    if (!card) return;

    const fromColumnId = card.columnId;

    // 乐观更新
    removeCardFromColumn(cardId, fromColumnId);
    insertCardToColumn(cardId, toColumnId, newSort);

    try {
      await api.updateKanbanCard(cardId, { columnId: toColumnId, sort: newSort });
    } catch {
      // 回滚
      removeCardFromColumn(cardId, toColumnId);
      insertCardToColumn(cardId, fromColumnId, card.sort);
    }
  }

  return {
    boards,
    currentBoardId,
    currentBoard,
    currentColumns,
    loading,
    dragState,
    loadBoards,
    moveCard,
  };
});
```

#### 4.2.4 拖拽实现

```vue
<!-- KanbanBoard.vue -->
<template>
  <div class="kanban-board">
    <div
      v-for="column in columns"
      :key="column.id"
      class="kanban-column"
      @dragover.prevent="onDragOver($event, column.id)"
      @drop="onDrop($event, column.id)"
    >
      <div class="column-header">
        <span class="column-color" :style="{ background: column.color }" />
        <span class="column-name">{{ column.name }}</span>
        <span class="column-count">{{ column.cards.length }}</span>
      </div>
      <div class="column-cards">
        <div
          v-for="card in column.cards"
          :key="card.id"
          class="kanban-card"
          draggable="true"
          @dragstart="onDragStart($event, card)"
          @dragend="onDragEnd"
        >
          <!-- 卡片内容 -->
        </div>
      </div>
    </div>
  </div>
</template>
```

### 4.3 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 数据库表设计与迁移 | 1天 |
| Phase 2 | 后端 API 实现 | 2天 |
| Phase 3 | Pinia 状态管理 | 1天 |
| Phase 4 | 看板视图 UI | 3天 |
| Phase 5 | 拖拽交互优化 | 1天 |

### 4.4 风险与回滚

- **风险**：拖拽性能问题（大量卡片）
- **回滚**：提供列表视图切换

---

## 5. PDF/Word 导出技术选型

### 5.1 现状分析

当前导出能力：

- Markdown 导出（前端或后端）
- HTML 导出
- JSON 导出

核心实现在 `server/src/modules/exports/exports.service.ts`。

### 5.2 目标

- PDF 导出（保留样式）
- Word（.docx）导出
- 批量导出（ZIP）

### 5.3 技术选型对比

#### 5.3.1 PDF 导出

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **前端：pdfmake** | 轻量、无需服务器资源 | 样式控制有限 | ⭐⭐⭐ |
| **前端：jspdf + html2canvas** | 支持复杂 HTML | 性能差、字体难控 | ⭐ |
| **后端：Puppeteer/Playwright** | 渲染精准 | 资源消耗大 | ⭐⭐⭐⭐ |
| **后端：PDFKit** | 轻量、可控 | 样式需手动编码 | ⭐⭐⭐ |
| **后端：LibreOffice 转换** | 格式保真 | 依赖系统库 | ⭐⭐ |

**推荐方案：混合策略**

- 小文档（< 50 页）：前端 pdfmake
- 大文档或复杂排版：后端 Puppeteer

#### 5.3.2 Word 导出

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **前端：docx.js** | 轻量、无需服务器 | 功能有限 | ⭐⭐⭐ |
| **后端：docx 库（Node.js）** | 功能完整 | 需处理图片 | ⭐⭐⭐⭐ |
| **后端：LibreOffice 转换** | 格式保真 | 依赖系统库 | ⭐⭐⭐ |

**推荐方案：后端 docx 库**

```typescript
// server/src/modules/exports/word-export.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { htmlToDocx } from './html-to-docx';

export async function exportDocAsWord(doc: ExportDocument): Promise<Buffer> {
  const sections = htmlToDocx(doc.contentHtml);

  const docx = new Document({
    sections: [{
      properties: {},
      children: sections,
    }],
  });

  return await Packer.toBuffer(docx);
}
```

#### 5.3.3 批量导出

```typescript
export async function exportBatchZip(
  actor: DocumentActor,
  docIds: number[]
): Promise<Buffer> {
  const docs = await getDocumentsForExport(actor, docIds);
  const archiver = require('archiver');

  const archive = archiver('zip', { zlib: { level: 9 } });

  for (const doc of docs) {
    const md = exportAsMarkdown(doc);
    archive.append(md, { name: `${doc.title}.md` });
  }

  // 添加图片
  const images = await collectImages(docs);
  for (const img of images) {
    archive.append(img.buffer, { name: `images/${img.filename}` });
  }

  return archive.finalize();
}
```

### 5.4 推荐架构

```
导出请求 → API 路由
    ↓
任务队列（BullMQ）
    ↓
Worker 处理
├── 小文档 → 前端导出（返回 base64）
├── PDF 大文档 → Puppeteer 服务
└── Word → docx 库
    ↓
存储到临时 R2 对象
    ↓
返回下载链接
```

### 5.5 迁移路径

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 后端 docx 导出实现 | - |
| Phase 2 | 后端 PDF 导出（Puppeteer） | Puppeteer 服务 |
| Phase 3 | 批量 ZIP 导出 | Phase 1 |
| Phase 4 | 前端导出 UI 优化 | Phase 1, 2 |

### 5.6 风险与回滚

- **风险**：Puppeteer 内存占用高
- **回滚**：限制并发数，使用队列限流

---

## 6. 文档评论批注系统设计

### 6.1 需求分析

- 对文档特定段落添加评论
- 评论回复（嵌套）
- @提及
- 已解决/未解决状态

### 6.2 推荐方案

#### 6.2.1 数据模型

**新增表：`doc_comments`**

```sql
CREATE TABLE doc_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES doc_comments(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  anchor_selector TEXT,  -- CSS 选择器或位置信息
  anchor_text TEXT,      -- 锚点文本快照
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX doc_comments_doc_idx ON doc_comments(doc_id);
CREATE INDEX doc_comments_parent_idx ON doc_comments(parent_id);
CREATE INDEX doc_comments_author_idx ON doc_comments(author_id);
```

**新增表：`doc_comment_mentions`**

```sql
CREATE TABLE doc_comment_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES doc_comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE(comment_id, user_id)
);
```

#### 6.2.2 API 设计

```
GET    /api/docs/:docUid/comments         # 获取文档评论
POST   /api/docs/:docUid/comments         # 创建评论（支持 anchorSelector）
PATCH  /api/comments/:id                  # 更新评论
DELETE /api/comments/:id                  # 删除评论
POST   /api/comments/:id/resolve          # 标记已解决
POST   /api/comments/:id/unresolve        # 取消已解决
POST   /api/comments/:id/mentions         # 添加 @提及
GET    /api/users/:userId/notifications   # 获取提及通知
POST   /api/notifications/:id/read        # 标记已读
```

#### 6.2.3 TipTap 集成

```typescript
// 评论标记扩展（见 2.3.2）
export const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return {
      commentId: { default: null },
    };
  },
  // ...
});

// 选中文本时显示评论按钮
editor.on('selectionUpdate', ({ editor }) => {
  const { from, to } = editor.state.selection;
  if (from !== to) {
    showCommentButton(at: { x, y });
  }
});
```

#### 6.2.4 实时通知

```typescript
// WebSocket 或 SSE
interface CommentNotification {
  type: 'comment' | 'mention' | 'resolve';
  commentId: number;
  docUid: string;
  authorId: number;
  authorName: string;
  preview: string;
  createdAt: Date;
}
```

### 6.3 迁移路径

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 1 | 数据库表设计与 API | - |
| Phase 2 | 前端评论侧边栏 | Phase 1 |
| Phase 3 | TipTap 评论标记集成 | Phase 2 |
| Phase 4 | @提及与通知 | 用户搜索 API |
| Phase 5 | 实时通知（WebSocket） | Phase 4 |

### 6.4 风险与回滚

- **风险**：评论数据膨胀影响文档性能
- **回滚**：评论独立存储，定期归档旧评论

---

## 7. 全文搜索优化方案

### 7.1 现状分析

当前搜索实现 (`docs.search.service.ts`)：
- 基础 LIKE 查询
- 批量解密后全文匹配
- 无索引优化

问题：
- 大文档解密开销大
- LIKE 查询无法支持分词
- 无法按相关性排序

### 7.2 推荐方案

#### 7.2.1 方案 A：MySQL 全文索引（推荐用于中小规模）

```sql
-- 启用 InnoDB 全文索引（MySQL 5.6+）
ALTER TABLE docs ADD FULLTEXT INDEX docs_content_fts (title, summary, content_html);
```

**优势：**
- 无需额外服务
- 增量同步
- 支持中文分词（需配置 ngram）

**劣势：**
- 大数据量性能下降
- 相关性算法简单

#### 7.2.2 方案 B：Meilisearch（推荐用于大规模）

```yaml
# docker-compose.yml
meilisearch:
  image: getmeili/meilisearch:v1.6
  environment:
    MEILI_MASTER_KEY: "${MEILI_MASTER_KEY}"
  volumes:
    - meilisearch_data:/meili_data"

# 同步脚本
async function syncToMeilisearch() {
  const docs = await dbAll(db.select().from(docs).where(isNull(docs.deletedAt)));
  
  const index = meilisearch.index('documents');
  const records = docs.map(doc => ({
    id: doc.id,
    docUid: doc.docUid,
    title: decrypt(doc.title),
    summary: decrypt(doc.summary),
    tags: doc.tags,
    ownerId: doc.ownerId,
    updatedAt: doc.updatedAt,
    // 内容单独索引，不解密全文
  }));

  await index.addDocuments(records, { primaryKey: 'id' });
}
```

**优势：**
- 毫秒级搜索
- 强大的相关性算法
- 支持中文分词
- 拼音搜索（可选）

**劣势：**
- 需要部署额外服务
- 数据同步复杂度

#### 7.2.3 方案 C：Elasticsearch（不推荐）

- 资源消耗大
- 运维复杂
- 过度设计

### 7.3 推荐架构：分层搜索

```
搜索请求
    ↓
1. 快速搜索（标题/摘要/标签）
   ├── MySQL LIKE 索引
   └── 返回候选集

2. 精确搜索（全文）
   ├── Meilisearch 检索
   └── 返回相关性排序结果

3. 内容搜索（可选）
   ├── 批量解密
   └── 正则/关键词匹配
```

### 7.4 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | MySQL 全文索引 | 1天 |
| Phase 2 | 搜索结果相关性优化 | 2天 |
| Phase 3 | Meilisearch 集成（可选） | 3天 |
| Phase 4 | 搜索历史与建议 | 2天 |

### 7.5 风险与回滚

- **风险**：全文索引占用存储空间
- **回滚**：保留原有 LIKE 查询作为兜底

---

## 8. 大文档性能优化

### 8.1 现状分析

当前实现已有部分优化：

```typescript
// ChendocEditor.vue
const delay = contentSize > 1_000_000 ? 1200 : contentSize > 200_000 ? 600 : 250;
contentEmitTimer = setTimeout(() => {
  flushContent(next);
}, delay);
```

问题：
- 编辑器渲染大文档卡顿
- 内容保存时解密/加密耗时
- 列表加载慢

### 8.2 推荐方案

#### 8.2.1 虚拟滚动（文档列表）

```vue
<!-- DocListPage.vue -->
<template>
  <RecycleScroller
    class="doc-list"
    :items="documents"
    :item-size="72"
    key-field="id"
    v-slot="{ item }"
  >
    <DocCard :doc="item" />
  </RecycleScroller>
</template>
```

#### 8.2.2 编辑器懒加载

```typescript
// 分片加载文档内容
async function loadContentInChunks(docUid: string, content: string) {
  const chunks = chunkString(content, 50000); // 50KB 每片
  
  for (const chunk of chunks) {
    await editor.commands.insertContent(chunk);
    await nextTick(); // 让渲染完成
  }
}
```

#### 8.2.3 内容缓存

```typescript
// 文档内容缓存（内存 + IndexedDB）
const contentCache = new LRUCache<string, DocumentContent>({
  max: 50,           // 最多缓存 50 个文档
  maxSize: 100_000_000, // 100MB
  ttl: 1000 * 60 * 10,  // 10 分钟
});
```

#### 8.2.4 后端优化

```typescript
// docs.service.ts - 分页加载
export async function listDocsPaged(
  actor: DocumentActor,
  options: { page: number; pageSize: number; fields?: string[] }
) {
  const fields = options.fields ?? ['id', 'docUid', 'title', 'summary', 'tags', 'updatedAt'];
  // 不加载 contentJson/contentHtml，按需加载
}
```

### 8.3 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 文档列表虚拟滚动 | 2天 |
| Phase 2 | 编辑器分片渲染 | 3天 |
| Phase 3 | 内容缓存实现 | 2天 |
| Phase 4 | 后端分页优化 | 1天 |

### 8.4 风险与回滚

- **风险**：虚拟滚动可能导致滚动位置丢失
- **回滚**：提供关闭虚拟滚动的开关

---

## 9. 定时发布/草稿过期机制

### 9.1 需求分析

- 定时发布文档
- 草稿过期提醒/自动归档
- 批量定时操作

### 9.2 推荐方案

#### 9.2.1 数据模型

**新增表：`scheduled_tasks`**

```sql
CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,  -- 'publish' | 'archive' | 'delete' | 'notify'
  doc_id INTEGER REFERENCES docs(id) ON DELETE CASCADE,
  payload TEXT,             -- JSON 额外参数
  execute_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed'
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX scheduled_tasks_execute_idx ON scheduled_tasks(execute_at, status);
```

#### 9.2.2 API 设计

```
POST   /api/docs/:docUid/schedule    # 创建定时任务
GET    /api/docs/:docUid/schedules   # 获取文档定时任务
DELETE /api/schedules/:id            # 取消定时任务

# 草稿过期设置
PATCH  /api/docs/:docUid/draft-settings
{
  "expireAfterDays": 30,        // 30 天后过期
  "expireAction": "archive",    // 归档或 delete
  "notifyBeforeDays": 7         // 过期前 7 天通知
}
```

#### 9.2.3 后端实现

```typescript
// server/src/modules/scheduler/scheduler.service.ts
import { db, dbAll } from '../../db/client.js';
import { scheduledTasks } from '../../db/schema.js';
import { docs } from '../../db/schema.js';

export class SchedulerService {
  // 每分钟检查一次
  async processScheduledTasks() {
    const now = Date.now();

    const tasks = await dbAll(
      db.select()
        .from(scheduledTasks)
        .where(and(
          eq(scheduledTasks.status, 'pending'),
          lte(scheduledTasks.executeAt, now)
        ))
        .limit(10) // 每次最多处理 10 个
    );

    for (const task of tasks) {
      await this.executeTask(task);
    }
  }

  private async executeTask(task: ScheduledTask) {
    try {
      await db.update(scheduledTasks)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(scheduledTasks.id, task.id));

      switch (task.taskType) {
        case 'publish':
          await this.publishDocument(task.docId!);
          break;
        case 'archive':
          await this.archiveDocument(task.docId!);
          break;
        // ...
      }

      await db.update(scheduledTasks)
        .set({ status: 'completed', result: '{}', updatedAt: new Date() })
        .where(eq(scheduledTasks.id, task.id));

    } catch (error) {
      await db.update(scheduledTasks)
        .set({ status: 'failed', result: JSON.stringify({ error: String(error) }) })
        .where(eq(scheduledTasks.id, task.id));
    }
  }
}
```

#### 9.2.4 过期提醒

```typescript
// 每日检查草稿过期
export async function checkDraftExpiration() {
  const settings = await dbAll(
    db.select()
      .from(docs)
      .where(and(
        eq(docs.status, 'draft'),
        // 30 天未更新的草稿
      ))
  );

  for (const doc of settings) {
    // 发送过期提醒通知
    await sendNotification({
      userId: doc.ownerId,
      type: 'draft_expiring',
      docUid: doc.docUid,
      daysUntilExpire: 7,
    });
  }
}
```

### 9.3 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 数据库表与基础 API | 1天 |
| Phase 2 | 定时任务执行器 | 2天 |
| Phase 3 | 草稿过期设置 UI | 2天 |
| Phase 4 | 过期提醒通知 | 1天 |

### 9.4 风险与回滚

- **风险**：时区处理复杂
- **回滚**：使用 UTC 时间存储

---

## 10. 开放 API 版本设计

### 10.1 需求分析

为第三方开发者提供 API 访问能力，支持：
- OAuth 2.0 认证
- RESTful API
- 版本控制
- 速率限制

### 10.2 推荐方案

#### 10.2.1 版本策略

```
/api/v1/...
/api/v2/...  (未来)
```

**版本约定：**
- URL 版本控制
- 主版本不兼容升级
- 次版本向后兼容

#### 10.2.2 认证方案

**OAuth 2.0 + JWT**

```typescript
// 授权码流程
GET /oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code&scope=read:docs

POST /oauth/token
{
  "grant_type": "authorization_code",
  "code": "xxx",
  "client_id": "xxx",
  "client_secret": "xxx"
}

// 响应
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "xxx",
  "scope": "read:docs write:docs"
}
```

#### 10.2.3 数据模型

**新增表：`api_clients`**

```sql
CREATE TABLE api_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  scopes TEXT NOT NULL DEFAULT '["read:docs"]',
  rate_limit INTEGER NOT NULL DEFAULT 100,  -- 每分钟请求数
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX api_clients_owner_idx ON api_clients(owner_id);
```

**新增表：`oauth_tokens`**

```sql
CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT,
  client_id TEXT NOT NULL REFERENCES api_clients(client_id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX oauth_tokens_user_idx ON oauth_tokens(user_id);
```

#### 10.2.4 API 设计

**OAuth 端点**

```
GET  /oauth/authorize      # 授权页面
POST /oauth/token          # 获取访问令牌
POST /oauth/revoke         # 撤销令牌
```

**文档 API（v1）**

```
GET    /api/v1/documents           # 列表文档
POST   /api/v1/documents           # 创建文档
GET    /api/v1/documents/:uid      # 获取文档
PATCH  /api/v1/documents/:uid      # 更新文档
DELETE /api/v1/documents/:uid      # 删除文档

GET    /api/v1/documents/:uid/versions      # 版本历史
GET    /api/v1/documents/:uid/shares        # 分享列表
POST   /api/v1/documents/:uid/shares        # 创建分享

GET    /api/v1/tags                # 标签列表
POST   /api/v1/tags                # 创建标签
```

**响应格式**

```json
{
  "data": {
    "id": 1,
    "docUid": "abc123",
    "title": "文档标题",
    "contentJson": "...",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-01-01T00:00:00Z"
  }
}
```

**错误格式**

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "文档不存在或无权访问",
    "details": {}
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

#### 10.2.5 速率限制

```typescript
// middleware/rateLimit.ts
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export async function rateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  const clientId = request.auth?.clientId;
  if (!clientId) return;

  const limit = getClientRateLimit(clientId); // 默认 100/min
  const key = `ratelimit:${clientId}`;

  const current = rateLimits.get(key) ?? { count: 0, resetAt: Date.now() + 60000 };

  if (Date.now() > current.resetAt) {
    current.count = 0;
    current.resetAt = Date.now() + 60000;
  }

  current.count++;
  rateLimits.set(key, current);

  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, limit - current.count));
  reply.header('X-RateLimit-Reset', Math.ceil(current.resetAt / 1000));

  if (current.count > limit) {
    reply.code(429).send({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
  }
}
```

### 10.3 迁移路径

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | OAuth 基础架构 | 3天 |
| Phase 2 | API 文档端点实现 | 3天 |
| Phase 3 | 速率限制与监控 | 2天 |
| Phase 4 | 开发者门户 | 5天 |
| Phase 5 | API 文档（Swagger） | 2天 |

### 10.4 风险与回滚

- **风险**：OAuth 安全漏洞
- **回滚**：可关闭开放 API 功能

---

## 附录

### A. 技术债务清理建议

| 模块 | 债务项 | 建议 |
|------|--------|------|
| CSS | 硬编码颜色值 | 统一使用 CSS 变量 |
| 编辑器 | TipTap v3 未完全利用 | 升级扩展生态 |
| 数据库 | 部分表无索引 | 补充缺失索引 |

### B. 性能基准

| 场景 | 目标 | 当前 |
|------|------|------|
| 文档列表加载（100条） | < 500ms | ~800ms |
| 文档保存 | < 1s | ~1.5s |
| 搜索响应 | < 200ms | ~500ms |
| 大文档渲染（10万字） | < 2s | ~5s |

### C. 依赖升级路线

| 包 | 当前版本 | 目标版本 | 优先级 |
|----|----------|----------|--------|
| TipTap | 3.7.2 | 3.x (latest) | 高 |
| Vue | 3.5.22 | 3.5.x | 中 |
| Pinia | 3.0.3 | 3.x | 中 |
| Fastify | 5.6.1 | 5.x | 中 |
| Drizzle ORM | 0.45.2 | 0.x (latest) | 低 |

---

## 版本历史

| 版本 | 日期 | 作者 | 变更 |
|------|------|------|------|
| 0.1.0 | 2026-07-01 | 架构师 | 初稿 |