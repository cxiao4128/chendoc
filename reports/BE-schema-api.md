# BE-数据库 Schema 与 API 设计

> ChenDoc 后端数据模型与接口设计文档
> 版本: 0.1.0 (初稿)
> 日期: 2026-07-01

---

## 目录

1. [概述](#1-概述)
2. [现有 Schema 概览](#2-现有-schema-概览)
3. [新增数据库表设计](#3-新增数据库表设计)
4. [API 接口设计](#4-api-接口设计)
5. [开放 API 基础架构](#5-开放-api-基础架构)
6. [定时发布任务调度](#6-定时发布任务调度)
7. [PDF/Word 导出后端支持](#7-pdfword-导出后端支持)
8. [Gateway Action Code 扩展](#8-gateway-action-code-扩展)
9. [迁移与兼容性](#9-迁移与兼容性)
10. [实现优先级](#10-实现优先级)

---

## 1. 概述

### 1.1 设计目标

- **多级标签**：支持父子层级、颜色自定义，满足内容分类需求
- **看板泳道**：Kanban 视图支持文档的泳道(WIP/To Do/Done 等)管理
- **批注系统**：支持高亮位置 + 评论，覆盖文档审阅协作场景
- **定时发布**：内容审核通过后，支持指定时间自动发布
- **全文搜索增强**：搜索结果高亮展示命中片段
- **开放 API**：面向第三方应用的 API 基础架构

### 1.2 设计原则

- 复用现有加密机制（文档内容 AES-256-GCM 加密）
- 兼容现有 Gateway 路由架构
- 遵循现有代码风格（TypeScript + Drizzle ORM + Zod 校验）
- 幂等性优先，异常路径完整

---

## 2. 现有 Schema 概览

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户 | id, username, passwordHash, role, status, totpEnabled |
| `docs` | 文档 | id, docUid, title, contentJsonCiphertext, status, tags(JSON), ownerId |
| `shares` | 分享 | id, docId, shareToken, reviewStatus, viewCount |
| `tags` | 标签 | id, name, color, ownerId, docCount |
| `spaces` | 空间 | id, name, ownerId |
| `forms` | 收集表 | id, formUid, fields(JSON), ownerId, status |
| `templates` | 模板 | id, title, contentJson, ownerId, isBuiltIn |
| `doc_versions` | 版本历史 | id, docId, title, contentJsonCiphertext |
| `uploads` | 上传文件 | id, objectKey, publicUrl, docId |

---

## 3. 新增数据库表设计

### 3.1 标签表增强（多级标签）

#### 新表：`tag_categories`（标签分类/多级父级）

```sql
CREATE TABLE tag_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL COMMENT '分类名称',
  parent_id INT NULL COMMENT '父分类ID，支持多级',
  color VARCHAR(16) NOT NULL DEFAULT '#64748b' COMMENT '分类颜色',
  icon VARCHAR(32) NULL COMMENT '图标名称/emoji',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序权重',
  owner_id INT NOT NULL COMMENT '所属用户',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_tag_categories_owner (owner_id),
  INDEX idx_tag_categories_parent (parent_id),
  UNIQUE KEY uk_tag_categories_name_owner (name, owner_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES tag_categories(id) ON DELETE SET NULL
);
```

#### 修改：`tags` 表新增字段

```sql
ALTER TABLE tags ADD COLUMN category_id INT NULL COMMENT '所属分类';
ALTER TABLE tags ADD COLUMN icon VARCHAR(32) NULL COMMENT '图标';
ALTER TABLE tags ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN description VARCHAR(255) NULL;
ALTER TABLE tags ADD COLUMN use_count INT NOT NULL DEFAULT 0 COMMENT '实际使用次数（定期汇总）';

CREATE INDEX idx_tags_category ON tags(category_id);
CREATE INDEX idx_tags_owner_sort ON tags(owner_id, sort_order);
```

#### Drizzle Schema 定义

```typescript
// schema.mysql.ts 追加

export const tagCategories = mysqlTable("tag_categories", {
  id: id(),
  name: varchar("name", { length: 64 }).notNull(),
  parentId: int("parent_id"),
  color: varchar("color", { length: 16 }).notNull().default("#64748b"),
  icon: varchar("icon", { length: 32 }),
  sortOrder: int("sort_order").notNull().default(0),
  ownerId: int("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  index("tag_categories_owner_idx").on(table.ownerId),
  index("tag_categories_parent_idx").on(table.parentId),
  uniqueIndex("uk_tag_categories_name_owner").on(table.name, table.ownerId)
]);

// tags 表追加字段
export const tags = mysqlTable("tags", {
  // ... 现有字段 ...
  categoryId: int("category_id"),
  icon: varchar("icon", { length: 32 }),
  sortOrder: int("sort_order").notNull().default(0),
  description: varchar("description", { length: 255 }),
  useCount: int("use_count").notNull().default(0)
}, (table) => [
  // ... 现有索引 ...
  index("tags_category_idx").on(table.categoryId),
  index("tags_owner_sort_idx").on(table.ownerId, table.sortOrder)
});
```

```typescript
// schema.sqlite.ts 追加（SQLite 版本）

export const tagCategories = sqliteTable("tag_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  parentId: integer("parent_id").references(() => tagCategories.id, { onDelete: "set null" }),
  color: text("color").notNull().default("#64748b"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  ownerIdx: index("tag_categories_owner_idx").on(table.ownerId),
  parentIdx: index("tag_categories_parent_idx").on(table.parentId),
  nameOwnerUnique: uniqueIndex("uk_tag_categories_name_owner").on(table.name, table.ownerId)
}));
```

### 3.2 看板泳道表

```sql
CREATE TABLE kanban_boards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  board_uid VARCHAR(32) NOT NULL UNIQUE COMMENT '泳道板UID',
  name VARCHAR(191) NOT NULL COMMENT '泳道板名称',
  description TEXT NULL,
  space_id INT NULL COMMENT '所属空间，可为空表示用户级',
  owner_id INT NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#6366f1' COMMENT '泳道板主题色',
  is_collapsed BOOLEAN NOT NULL DEFAULT FALSE COMMENT '默认折叠状态',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_kanban_boards_owner (owner_id),
  INDEX idx_kanban_boards_space (space_id),
  UNIQUE KEY uk_kanban_boards_uid (board_uid),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE SET NULL
);
```

### 3.3 泳道（Lane）表

```sql
CREATE TABLE kanban_lanes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  board_id INT NOT NULL,
  name VARCHAR(64) NOT NULL COMMENT '泳道名称：To Do / In Progress / Done',
  color VARCHAR(16) NOT NULL DEFAULT '#94a3b8',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '泳道排序',
  wip_limit INT NULL COMMENT '在制品限制数量',
  is_done BOOLEAN NOT NULL DEFAULT FALSE COMMENT '标记为已完成泳道',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_kanban_lanes_board (board_id),
  UNIQUE KEY uk_kanban_lanes_board_order (board_id, sort_order),
  FOREIGN KEY (board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE
);
```

### 3.4 文档-泳道关联表

```sql
CREATE TABLE doc_lane_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  lane_id INT NOT NULL,
  assigned_at DATETIME(3) NOT NULL,
  assigned_by INT NULL,

  UNIQUE KEY uk_doc_lane (doc_id),
  INDEX idx_doc_lane_lane (lane_id),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (lane_id) REFERENCES kanban_lanes(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);
```

### 3.5 批注（Annotation）表

```sql
CREATE TABLE annotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  author_id INT NOT NULL,
  type ENUM('highlight', 'comment', 'reply') NOT NULL DEFAULT 'comment',

  -- 高亮位置（基于 TipTap JSON 结构）
  highlight_json TEXT NULL COMMENT '高亮范围的 JSON 坐标：{from, to, fromPos, toPos}',

  -- 评论内容
  content TEXT NOT NULL COMMENT '批注正文，支持 Markdown',

  -- 状态
  status ENUM('active', 'resolved', 'deleted') NOT NULL DEFAULT 'active',
  resolved_by INT NULL,
  resolved_at DATETIME(3) NULL,

  -- 上下文
  parent_id INT NULL COMMENT '回复目标，指向同一 doc_id 下的另一条批注',
  quote_text TEXT NULL COMMENT '批注引用的原文片段',

  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_annotations_doc (doc_id),
  INDEX idx_annotations_author (author_id),
  INDEX idx_annotations_status (status),
  INDEX idx_annotations_parent (parent_id),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES annotations(id) ON DELETE CASCADE
);
```

### 3.6 定时发布配置表

```sql
CREATE TABLE scheduled_publishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  scheduled_at DATETIME(3) NOT NULL COMMENT '计划发布时间',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',

  -- 发布后操作
  action_after ENUM('none', 'share', 'send_notification') NOT NULL DEFAULT 'none',
  notify_user_ids JSON NULL COMMENT '通知哪些用户',
  share_config JSON NULL COMMENT '分享配置：{password, expireDays}',

  status ENUM('pending', 'published', 'cancelled', 'failed') NOT NULL DEFAULT 'pending',
  executed_at DATETIME(3) NULL COMMENT '实际执行时间',
  error_message TEXT NULL,

  created_by INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_scheduled_publishes_doc (doc_id),
  INDEX idx_scheduled_publishes_status (status),
  INDEX idx_scheduled_publishes_scheduled (scheduled_at, status) COMMENT '调度查询索引',
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

### 3.7 全文搜索高亮缓存表（可选优化）

```sql
CREATE TABLE search_highlights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  user_id INT NOT NULL COMMENT '针对特定用户的高亮缓存',
  highlight_data JSON NOT NULL COMMENT '{query: [positions]}',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  UNIQUE KEY uk_search_highlights_doc_user (doc_id, user_id),
  INDEX idx_search_highlights_expire (updated_at),
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 4. API 接口设计

### 4.1 标签 CRUD API

#### 基础接口（扩展现有）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 获取用户所有标签（按分类/使用频率排序） |
| POST | `/api/tags` | 创建标签（支持 categoryId） |
| PATCH | `/api/tags/:id` | 更新标签 |
| DELETE | `/api/tags/:id` | 删除标签（级联更新文档中的标签引用） |

#### 新增接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags/categories` | 获取标签分类树 |
| POST | `/api/tags/categories` | 创建标签分类 |
| PATCH | `/api/tags/categories/:id` | 更新标签分类 |
| DELETE | `/api/tags/categories/:id` | 删除分类（分类下的标签移至根级） |
| POST | `/api/tags/batch` | 批量创建/更新标签 |
| GET | `/api/tags/suggestions` | 根据文档内容推荐标签 |

#### 请求/响应示例

```typescript
// POST /api/tags/categories
// Request
{
  "name": "技术文档",
  "parentId": null,        // 可选，null = 根级
  "color": "#8b5cf6",
  "icon": "code"
}

// GET /api/tags?withCategories=true
// Response
{
  "categories": [
    {
      "id": 1,
      "name": "技术文档",
      "color": "#8b5cf6",
      "icon": "code",
      "children": [
        { "id": 2, "name": "API", "color": "#3b82f6", "tags": [...] }
      ],
      "tags": [...]
    }
  ]
}
```

### 4.2 看板 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/kanban` | 获取用户所有泳道板 |
| POST | `/api/kanban` | 创建泳道板 |
| GET | `/api/kanban/:boardUid` | 获取泳道板详情（含所有泳道和文档） |
| PATCH | `/api/kanban/:boardUid` | 更新泳道板 |
| DELETE | `/api/kanban/:boardUid` | 删除泳道板 |
| GET | `/api/kanban/:boardUid/lanes` | 获取泳道列表 |
| POST | `/api/kanban/:boardUid/lanes` | 创建泳道 |
| PATCH | `/api/kanban/lanes/:id` | 更新泳道（名称/顺序/WIP限制） |
| DELETE | `/api/kanban/lanes/:id` | 删除泳道 |
| POST | `/api/kanban/lanes/:id/move` | 移动文档到目标泳道 |

#### 移动文档到泳道

```typescript
// POST /api/kanban/lanes/:id/move
// Request
{
  "docUid": "abc123...",        // 文档UID
  "targetLaneId": 5,            // 目标泳道ID
  "insertBefore": null,         // 插入到哪个文档前，null = 末尾
  "insertAfter": null            // 或插入到哪个文档后
}

// Response
{
  "success": true,
  "assignment": {
    "docId": 42,
    "laneId": 5,
    "assignedAt": "2026-07-01T12:00:00Z"
  }
}
```

### 4.3 批注 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/docs/:docUid/annotations` | 获取文档所有批注（支持 status 过滤） |
| POST | `/api/docs/:docUid/annotations` | 创建批注（高亮+评论） |
| PATCH | `/api/annotations/:id` | 更新批注内容 |
| DELETE | `/api/annotations/:id` | 删除批注 |
| POST | `/api/annotations/:id/resolve` | 标记为已解决 |
| POST | `/api/annotations/:id/replies` | 添加回复 |
| GET | `/api/annotations/:id/replies` | 获取回复列表 |

#### 创建批注请求示例

```typescript
// POST /api/docs/abc123/annotations
// Request
{
  "type": "comment",
  "highlightJson": {
    "from": 120,
    "to": 150,
    "fromPos": { "line": 5, "col": 10 },
    "toPos": { "line": 5, "col": 40 }
  },
  "content": "这段描述需要更新，API 版本已经变了。",
  "quoteText": "v1 API endpoint is..."
}

// Response
{
  "annotation": {
    "id": 88,
    "docId": 42,
    "authorId": 1,
    "type": "comment",
    "highlightJson": { "from": 120, "to": 150 },
    "content": "这段描述需要更新，API 版本已经变了。",
    "quoteText": "v1 API endpoint is...",
    "status": "active",
    "createdAt": "2026-07-01T12:00:00Z"
  }
}
```

### 4.4 全文搜索优化 API

#### 高亮支持

```typescript
// GET /api/docs/search?q=keyword&highlight=true&page=1&pageSize=20
// Response
{
  "results": [
    {
      "id": 1,
      "docUid": "abc123",
      "title": "API 文档",
      "snippet": "...介绍了 <mark>v1</mark> API 的使用方法...",
      "highlights": [
        { "field": "title", "fragments": ["<mark>API</mark> 文档"] },
        { "field": "content", "fragments": ["...介绍了 <mark>v1</mark> API 的使用方法..."] }
      ],
      "updatedAt": "2026-07-01T10:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 20,
  "hasMore": false
}
```

### 4.5 定时发布 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scheduled-publishes` | 获取用户的定时发布列表 |
| POST | `/api/scheduled-publishes` | 创建定时发布任务 |
| GET | `/api/scheduled-publishes/:id` | 获取定时发布详情 |
| PATCH | `/api/scheduled-publishes/:id` | 更新定时发布（可调整时间） |
| DELETE | `/api/scheduled-publishes/:id` | 取消定时发布 |
| POST | `/api/scheduled-publishes/:id/cancel` | 取消（显式操作） |

#### 创建定时发布请求示例

```typescript
// POST /api/scheduled-publishes
// Request
{
  "docUid": "abc123",
  "scheduledAt": "2026-07-15T09:00:00+08:00",
  "timezone": "Asia/Shanghai",
  "actionAfter": "share",
  "shareConfig": {
    "password": "optional123",
    "expireDays": 30
  }
}
```

---

## 5. 开放 API 基础架构

### 5.1 API Key 管理

```sql
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_id VARCHAR(48) NOT NULL UNIQUE COMMENT 'API Key ID (pub)',
  key_secret_hash VARCHAR(128) NOT NULL COMMENT 'API Key Secret 哈希',
  name VARCHAR(128) NOT NULL COMMENT 'Key 名称/用途',
  owner_id INT NOT NULL,
  scopes JSON NOT NULL COMMENT '授权范围：["docs:read", "docs:write", "tags:read"]',
  rate_limit INT NOT NULL DEFAULT 1000 COMMENT '每分钟请求限制',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at DATETIME(3) NULL,
  expire_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,

  INDEX idx_api_keys_owner (owner_id),
  UNIQUE KEY uk_api_keys_key_id (key_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 5.2 API 请求日志

```sql
CREATE TABLE api_request_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_id VARCHAR(48) NOT NULL,
  method VARCHAR(16) NOT NULL,
  path VARCHAR(512) NOT NULL,
  status_code INT NOT NULL,
  response_time_ms INT NOT NULL,
  ip_hash VARCHAR(64) NOT NULL COMMENT 'IP 不可逆哈希',
  user_agent TEXT NULL,
  request_id VARCHAR(64) NOT NULL UNIQUE COMMENT '请求追踪ID',
  created_at DATETIME(3) NOT NULL,

  INDEX idx_api_request_logs_key (key_id),
  INDEX idx_api_request_logs_time (created_at)
);
```

### 5.3 开放 API 路由

```
/api/open/v1/docs                    GET    文档列表（需要 docs:read scope）
/api/open/v1/docs/:docUid            GET    获取文档详情
/api/open/v1/tags                    GET    标签列表（需要 tags:read scope）
/api/open/v1/search                  GET    搜索文档（需要 docs:read scope）
```

### 5.4 认证方式

```typescript
// 方式1: API Key
// Header: X-API-Key: <key_id>
// Header: X-API-Secret: <key_secret>

// 方式2: Bearer Token（OAuth2 风格）
// Header: Authorization: Bearer <access_token>
```

---

## 6. 定时发布任务调度

### 6.1 调度器设计

```typescript
// server/src/scheduler/scheduled-publish.scheduler.ts

interface ScheduledPublishJob {
  id: number;
  docId: number;
  scheduledAt: Date;
  timezone: string;
  actionAfter: "none" | "share" | "send_notification";
  shareConfig?: ShareConfig;
  createdBy: number;
}

export class ScheduledPublishScheduler {
  private intervalMs = 60_000; // 每分钟轮询
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  stop() {
    this.running = false;
  }

  private async poll() {
    while (this.running) {
      try {
        await this.processDueJobs();
      } catch (err) {
        console.error("定时发布调度器错误:", err);
      }
      await sleep(this.intervalMs);
    }
  }

  private async processDueJobs() {
    const now = new Date();
    const dueJobs = await dbAll(
      db.select().from(scheduledPublishes)
        .where(and(
          eq(scheduledPublishes.status, "pending"),
          sql`${scheduledPublishes.scheduledAt} <= ${now}`
        ))
        .limit(50) // 批量处理上限
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
    }
  }

  private async executeJob(job: ScheduledPublishJob) {
    try {
      // 1. 检查文档是否仍可发布
      const doc = await getDocByUid(job.docUid, { id: job.createdBy, role: "user" });
      if (doc.status === "published") {
        await markJobCompleted(job.id, "cancelled", "文档已发布");
        return;
      }

      // 2. 发布文档
      await dbRun(db.update(docs)
        .set({ status: "published", updatedBy: job.createdBy, updatedAt: now() })
        .where(eq(docs.id, job.docId)));

      // 3. 执行后续操作
      if (job.actionAfter === "share") {
        await createShare(job.docId, job.createdBy, job.shareConfig);
      } else if (job.actionAfter === "send_notification") {
        await sendPublishNotification(job);
      }

      await markJobCompleted(job.id, "published", null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      await markJobCompleted(job.id, "failed", errorMessage);
    }
  }

  private async markJobCompleted(
    jobId: number,
    status: "published" | "cancelled" | "failed",
    errorMessage: string | null
  ) {
    await dbRun(db.update(scheduledPublishes)
      .set({
        status,
        executedAt: now(),
        errorMessage,
        updatedAt: now()
      })
      .where(eq(scheduledPublishes.id, jobId)));
  }
}
```

### 6.2 时区处理

```typescript
// 使用 Temporal 或 date-fns-tz 处理时区转换
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";

function toUtc(scheduledAt: string, timezone: string): Date {
  return zonedTimeToUtc(new Date(scheduledAt), timezone);
}

function formatLocal(scheduledAt: Date, timezone: string): string {
  return utcToZonedTime(scheduledAt, timezone).toISOString();
}
```

---

## 7. PDF/Word 导出后端支持

### 7.1 导出架构

```
Client Request → POST /api/docs/export
                    ↓
              生成任务 ID → 写入 export_jobs 表
                    ↓
              返回 taskId → Client 轮询 /api/docs/export/:taskId
                    ↓
              后台 Worker 处理（支持多 Worker 扩展）
                    ↓
              上传 R2/本地存储 → 返回下载 URL
```

### 7.2 导出任务表

```sql
CREATE TABLE export_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_uid VARCHAR(32) NOT NULL UNIQUE,
  owner_id INT NOT NULL,
  doc_ids JSON NOT NULL COMMENT '[1, 2, 3]',
  format ENUM('pdf', 'docx', 'html', 'markdown', 'zip') NOT NULL,

  -- 导出选项
  options JSON NOT NULL DEFAULT '{}' COMMENT '{includeComments, includeMetadata, paperSize}',

  -- 状态
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0 COMMENT '0-100',

  -- 结果
  file_key VARCHAR(255) NULL COMMENT 'R2 对象 key',
  file_url TEXT NULL COMMENT '下载 URL',
  file_size INT NULL,
  error_message TEXT NULL,
  expires_at DATETIME(3) NULL COMMENT '下载链接过期时间',

  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,

  INDEX idx_export_jobs_owner (owner_id),
  INDEX idx_export_jobs_status (status),
  UNIQUE KEY uk_export_jobs_uid (job_uid),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 7.3 导出服务

```typescript
// server/src/modules/exports/export-advanced.service.ts

import Puppeteer from "puppeteer";        // PDF
import { Document, Packer } from "docx";  // Word
import archiver from "archiver";           // ZIP

export interface ExportOptions {
  includeComments?: boolean;
  includeMetadata?: boolean;
  paperSize?: "A4" | "Letter" | "Legal";
  margins?: { top: number; bottom: number; left: number; right: number };
  includeToc?: boolean;
}

export async function processExportJob(jobId: number): Promise<void> {
  const job = await getExportJob(jobId);
  const docs = await getDocumentsForExport(job.ownerId, job.docIds);

  const { format, options } = job;
  let output: Buffer | string;

  switch (format) {
    case "pdf":
      output = await exportToPdf(docs, options);
      break;
    case "docx":
      output = await exportToDocx(docs, options);
      break;
    case "markdown":
      output = docs.map(d => exportAsMarkdown(d)).join("\n\n---\n\n");
      break;
    case "zip":
      output = await exportToZip(docs, options);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // 上传到 R2 或本地存储
  const { fileKey, fileUrl } = await uploadExport(output, format, job.jobUid);

  // 更新任务状态
  await updateExportJob(jobId, {
    status: "completed",
    progress: 100,
    fileKey,
    fileUrl,
    fileSize: output.length,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时过期
  });
}

async function exportToPdf(docs: ExportDocument[], options: ExportOptions): Promise<Buffer> {
  const browser = await Puppeteer.launch({ headless: true });
  const pages: Buffer[] = [];

  for (const doc of docs) {
    const page = await browser.newPage();
    const html = buildExportHtml(doc, options);
    await page.setContent(html);
    const pdf = await page.pdf({
      format: options.paperSize || "A4",
      printBackground: true,
      margin: options.margins || { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    pages.push(pdf);
    await page.close();
  }

  await browser.close();
  return Buffer.concat(pages);
}

async function exportToDocx(docs: ExportDocument[], options: ExportOptions): Promise<Buffer> {
  const children = [];

  for (const doc of docs) {
    children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }));
    if (options.includeMetadata) {
      children.push(new Paragraph({ text: `创建: ${doc.createdAt.toISOString()}` }));
    }
    // 转换 HTML 内容为 DocX 节点
    const htmlContent = doc.contentHtml;
    const docxNodes = htmlToDocxNodes(htmlContent);
    children.push(...docxNodes);
    children.push(new Paragraph({ children: [] })); // 分隔符
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return await Packer.toBuffer(doc);
}
```

---

## 8. Gateway Action Code 扩展

### 8.1 新增 Action Code

在 `action-registry.ts` 中追加以下代码：

```typescript
// 标签模块 (t1-t9)
"t1",  // GET /api/tags/categories
"t2",  // POST /api/tags/categories
"t3",  // PATCH /api/tags/categories/:id
"t4",  // DELETE /api/tags/categories/:id
"t5",  // POST /api/tags/batch
"t6",  // GET /api/tags/suggestions

// 看板模块 (k1-k9)
"k1",  // GET /api/kanban
"k2",  // POST /api/kanban
"k3",  // GET /api/kanban/:boardUid
"k4",  // PATCH /api/kanban/:boardUid
"k5",  // DELETE /api/kanban/:boardUid
"k6",  // GET /api/kanban/:boardUid/lanes
"k7",  // POST /api/kanban/:boardUid/lanes
"k8",  // PATCH /api/kanban/lanes/:id
"k9",  // DELETE /api/kanban/lanes/:id
"k10", // POST /api/kanban/lanes/:id/move

// 批注模块 (n1-n9) [annotation → n]
"n1",  // GET /api/docs/:docUid/annotations
"n2",  // POST /api/docs/:docUid/annotations
"n3",  // PATCH /api/annotations/:id
"n4",  // DELETE /api/annotations/:id
"n5",  // POST /api/annotations/:id/resolve
"n6",  // POST /api/annotations/:id/replies
"n7",  // GET /api/annotations/:id/replies

// 定时发布模块 (sp1-sp5) [scheduled publish → sp]
"sp1", // GET /api/scheduled-publishes
"sp2", // POST /api/scheduled-publishes
"sp3", // GET /api/scheduled-publishes/:id
"sp4", // PATCH /api/scheduled-publishes/:id
"sp5", // DELETE /api/scheduled-publishes/:id

// 导出模块 (e1-e3) [export → e]
"e1",  // POST /api/docs/export
"e2",  // GET /api/docs/export/:taskId
"e3",  // GET /api/docs/export/:taskId/download

// 开放 API 模块 (oa1-oa4) [open api → oa]
"oa1", // GET /api/open/v1/docs
"oa2", // GET /api/open/v1/docs/:docUid
"oa3", // GET /api/open/v1/tags
"oa4", // GET /api/open/v1/search
```

### 8.2 routes.ts 路由映射（部分示例）

```typescript
// server/src/gateway/routes.ts

case "t1":
  return { method: "GET", url: "/api/tags/categories" };
case "t2":
  return { method: "POST", url: "/api/tags/categories", body: bodyOf(payload) };
case "t3":
  return { method: "PATCH", url: `/api/tags/categories/${param(payload, "id")}`, body: bodyOf(payload) };
case "t4":
  return { method: "DELETE", url: `/api/tags/categories/${param(payload, "id")}` };

// 看板
case "k1":
  return { method: "GET", url: "/api/kanban" };
case "k2":
  return { method: "POST", url: "/api/kanban", body: bodyOf(payload) };
case "k3":
  return { method: "GET", url: `/api/kanban/${param(payload, "boardUid")}` };
case "k10":
  return { method: "POST", url: `/api/kanban/lanes/${param(payload, "laneId")}/move`, body: bodyOf(payload) };

// 批注
case "n1":
  return { method: "GET", url: `/api/docs/${param(payload, "docUid")}/annotations${queryString(payload)}` };
case "n2":
  return { method: "POST", url: `/api/docs/${param(payload, "docUid")}/annotations`, body: bodyOf(payload) };

// 定时发布
case "sp1":
  return { method: "GET", url: "/api/scheduled-publishes" };
case "sp2":
  return { method: "POST", url: "/api/scheduled-publishes", body: bodyOf(payload) };

// 导出
case "e1":
  return { method: "POST", url: "/api/docs/export", body: bodyOf(payload) };
case "e2":
  return { method: "GET", url: `/api/docs/export/${param(payload, "taskId")}` };
```

---

## 9. 迁移与兼容性

### 9.1 数据库迁移策略

使用 Drizzle Kit 进行迁移：

```typescript
// drizzle.config.ts 配置

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql", // 或 "sqlite"
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};
```

迁移脚本命名：
- `0001_add_tag_categories.sql` - 标签分类表
- `0002_add_kanban_tables.sql` - 看板相关表
- `0003_add_annotations.sql` - 批注表
- `0004_add_scheduled_publishes.sql` - 定时发布表
- `0005_add_api_keys.sql` - 开放 API 表
- `0006_add_export_jobs.sql` - 导出任务表
- `0007_add_tags_new_columns.sql` - tags 表新增字段

### 9.2 向后兼容性

| 场景 | 处理方式 |
|------|----------|
| 现有 `docs.tags` 字段 | JSON 数组格式不变，兼容现有写入 |
| 现有 `tags` 表 | 追加字段，`category_id` 可为空（默认根级） |
| 现有 Gateway | 新增 action code 不影响现有功能 |
| 现有搜索 | `highlight=true` 参数默认 false，保持原行为 |

### 9.3 幂等性保证

| 操作 | 幂等处理 |
|------|----------|
| 创建标签 | name + ownerId 唯一约束，重复创建返回已有记录 |
| 创建泳道板 | boardUid 全局唯一，使用现有 uid 生成逻辑 |
| 移动文档到泳道 | doc_lane_assignments(doc_id) 唯一约束，UPSERT |
| 定时发布 | 同一文档可创建多个定时任务，由 ID 区分 |
| 导出任务 | jobUid 全局唯一，支持轮询状态 |

---

## 10. 实现优先级

### Phase 1: 核心数据模型（预计工作量：中）

| 任务 | 优先级 | 复杂度 |
|------|--------|--------|
| 标签分类表 + tags 字段扩展 | P0 | 低 |
| 看板表（board + lane + doc_lane） | P0 | 中 |
| 批注表 | P1 | 中 |
| 定时发布表 | P1 | 中 |

### Phase 2: API 开发（预计工作量：大）

| 任务 | 优先级 | 复杂度 |
|------|--------|--------|
| 标签 CRUD API（含分类） | P0 | 低 |
| 看板 API | P0 | 中 |
| 批注 API | P1 | 中 |
| 定时发布 API + 调度器 | P1 | 高 |
| 搜索高亮支持 | P2 | 中 |
| 导出 API（含 PDF/DOCX） | P2 | 高 |

### Phase 3: 开放 API（预计工作量：中）

| 任务 | 优先级 | 复杂度 |
|------|--------|--------|
| API Key 管理 API | P1 | 中 |
| 开放 API 路由 + 认证中间件 | P2 | 中 |
| 请求日志与限流 | P2 | 中 |

### 10.1 风险与注意事项

1. **批注高亮坐标**：依赖 TipTap 的 JSON 结构，需与前端对齐坐标格式
2. **PDF 导出性能**：Puppeteer 无头浏览器内存开销大，建议独立 Worker 队列
3. **定时发布时区**：用户时区需前端传入，服务端统一存 UTC
4. **泳道删除 cascade**：删除泳道时，文档分配记录同步删除
5. **文档加密**：批注内容不加密（如需加密会增加复杂度）

---

## 附录 A：完整 Schema 导出（MySQL）

```sql
-- === 标签分类 ===
CREATE TABLE tag_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  parent_id INT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#64748b',
  icon VARCHAR(32) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  owner_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_tag_categories_owner (owner_id),
  INDEX idx_tag_categories_parent (parent_id),
  UNIQUE KEY uk_tag_categories_name_owner (name, owner_id)
);

-- === 看板 ===
CREATE TABLE kanban_boards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  board_uid VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  space_id INT NULL,
  owner_id INT NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  is_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE kanban_lanes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  board_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#94a3b8',
  sort_order INT NOT NULL DEFAULT 0,
  wip_limit INT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE doc_lane_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  lane_id INT NOT NULL,
  assigned_at DATETIME(3) NOT NULL,
  assigned_by INT NULL,
  UNIQUE KEY uk_doc_lane (doc_id)
);

-- === 批注 ===
CREATE TABLE annotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  author_id INT NOT NULL,
  type ENUM('highlight','comment','reply') NOT NULL DEFAULT 'comment',
  highlight_json TEXT NULL,
  content TEXT NOT NULL,
  status ENUM('active','resolved','deleted') NOT NULL DEFAULT 'active',
  resolved_by INT NULL,
  resolved_at DATETIME(3) NULL,
  parent_id INT NULL,
  quote_text TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

-- === 定时发布 ===
CREATE TABLE scheduled_publishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_id INT NOT NULL,
  scheduled_at DATETIME(3) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  action_after ENUM('none','share','send_notification') NOT NULL DEFAULT 'none',
  notify_user_ids JSON NULL,
  share_config JSON NULL,
  status ENUM('pending','published','cancelled','failed') NOT NULL DEFAULT 'pending',
  executed_at DATETIME(3) NULL,
  error_message TEXT NULL,
  created_by INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

-- === 开放 API ===
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_id VARCHAR(48) NOT NULL UNIQUE,
  key_secret_hash VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  owner_id INT NOT NULL,
  scopes JSON NOT NULL,
  rate_limit INT NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at DATETIME(3) NULL,
  expire_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL
);

-- === 导出任务 ===
CREATE TABLE export_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_uid VARCHAR(32) NOT NULL UNIQUE,
  owner_id INT NOT NULL,
  doc_ids JSON NOT NULL,
  format ENUM('pdf','docx','html','markdown','zip') NOT NULL,
  options JSON NOT NULL DEFAULT '{}',
  status ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0,
  file_key VARCHAR(255) NULL,
  file_url TEXT NULL,
  file_size INT NULL,
  error_message TEXT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);
```

---

*文档版本：0.1.0 | 最后更新：2026-07-01*
