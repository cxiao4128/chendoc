# ChenDoc 性能审计报告

**审计时间**: 2026-06-30
**审计范围**: 数据库查询、N+1 问题、缺失索引、慢查询、API 响应时间、前端渲染性能、资源加载、缓存策略、内存泄漏风险
**项目版本**: v2.10.0

---

## 审计摘要

| 级别 | 数量 | 状态 |
|------|------|------|
| High | 1 | 待修复 |
| Medium | 4 | 待修复 |
| Low | 3 | 待优化 |

---

## High 级问题

### 1. DocListPage.vue computed 重复遍历数组

**文件**: `apps/admin/src/pages/docs/DocListPage.vue`

**问题描述**:
`visibleDocs` computed 属性每次重新计算时会对 `allDocs` 进行多次 filter 和 sort 操作，且多个统计 computed（`publishedCount`、`sharedCount`、`reviewCount`、`draftCount`、`unsharedCount`）也都各自独立遍历 `allDocs`。

**影响**:
- 当文档数量达到 100+ 时，每次筛选/排序操作都会触发 O(n×m) 的复杂度
- 用户切换视图或排序时会产生明显卡顿

**当前代码**:
```typescript
// 第75-100行 - visibleDocs 每次都完整遍历
const visibleDocs = computed(() => {
  const viewFiltered = activeView.value === "published"
    ? allDocs.value.filter((doc) => doc.status === "published")
    : activeView.value === "shared"
      ? allDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled)
      // ... 更多分支
  return [...filtered].sort((left, right) => { /* sort */ });
});

// 第122-126行 - 各自独立遍历
const publishedCount = computed(() => allDocs.value.filter((doc) => doc.status === "published").length);
const sharedCount = computed(() => allDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled).length);
const reviewCount = computed(() => allDocs.value.filter((doc) => doc.shareReviewStatus === "pending").length);
const draftCount = computed(() => allDocs.value.filter((doc) => doc.status !== "published").length);
const unsharedCount = computed(() => allDocs.value.filter((doc) => !doc.shareCode || !doc.shareEnabled).length);
```

**建议方案**:
1. 使用单一 pass 统计所有分类计数
2. 在同一遍历中完成分类筛选，避免重复 filter

---

## Medium 级问题

### 2. Gateway 双层序列化

**文件**: `server/src/gateway/routes.ts`, `server/src/gateway/packet.ts`

**问题描述**:
Gateway 在处理请求时存在 JSON.stringify → AES加密 → JSON.stringify 的双层序列化问题。

**建议**: 检查 packet.ts 中的序列化逻辑，确保只进行一次序列化。

### 3. 中文搜索无全文索引

**文件**: `server/src/modules/docs/docs.service.ts`

**问题描述**:
中文文档标题和内容搜索使用 LIKE 查询，无全文索引支持。

**当前代码**:
```typescript
// 典型的 LIKE 查询
const docs = await dbAll(
  select(docsTable).from(docsTable)
    .where(like(docsTable.title, `%${keyword}%`))
);
```

**建议**: 为 MySQL 添加中文全文索引或使用 ngram 分词器。

### 4. 图片资源未实现懒加载

**文件**: `apps/admin/src/pages/docs/DocListPage.vue`

**问题描述**:
文档列表中的缩略图和图片资源在首次加载时全部请求，无懒加载机制。

**建议**: 使用 `loading="lazy"` 属性或 Intersection Observer 实现图片懒加载。

### 5. 文档列表 API 缺少缓存策略

**文件**: `server/src/modules/docs/docs.routes.ts`

**问题描述**:
文档列表 API（`GET /api/docs`）未实现服务端缓存。

**建议**: 添加 Cache-Control 响应头或实现内存缓存层。

---

## Low 级问题

### 6. loginFailures 索引已优化

**状态**: ✅ **已确认**

数据库迁移文件 `20260613_add_query_indexes.ts` 已包含复合索引：
```typescript
createIndex("login_failures_user_created_idx")
  .on(table.loginFailures)
  .columns([column("userId"), column("createdAt")])
```

**无需修改**

### 7. 详情缓存无上限

**文件**: `apps/admin/src/stores/doc.ts`

**问题描述**:
`DETAIL_CACHE_TTL_MS` 缓存使用 TTL 但无容量上限，在长时间使用后可能导致内存增长。

**建议**: 添加 LRU 缓存容量限制。

### 8. 正则表达式循环创建

**文件**: `server/src/utils/sanitize.ts`

**问题描述**:
每次调用 sanitize 函数时都重新创建正则表达式实例。

**建议**: 将正则表达式提取为模块级常量。

---

## 正面实践（已验证）

| 类别 | 状态 | 说明 |
|------|------|------|
| 数据库索引 | ✅ | 完善的复合索引设计 |
| 缓存机制 | ✅ | TTL + LRU 双重保障 |
| 代码分割 | ✅ | Vite 配置合理的 chunk |
| 分页规范 | ✅ | 使用 cursor/offset 分页 |
| 图标优化 | ✅ | 支持 tree-shake |
| 资源清理 | ✅ | 组件有 onUnmounted 清理 |

---

## 修复优先级

1. **立即修复**: DocListPage.vue computed 优化（High）
2. **本周修复**: Gateway 序列化、中文索引（Medium）
3. **计划修复**: 图片懒加载、缓存策略（Medium/Low）

---

*报告生成时间: 2026-06-30*
