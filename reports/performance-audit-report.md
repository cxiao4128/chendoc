# ChenDoc 性能审计报告

**审计时间**: 2026-06-30
**审计范围**: server (Fastify/Drizzle), apps/admin (Vue 3/Pinia/Vite)
**影响等级定义**:
- **Critical**: 严重影响性能，需立即修复
- **High**: 显著影响用户体验，建议近期修复
- **Medium**: 可观察到的性能损耗，中期优化
- **Low**: 微小影响或潜在风险，可后续处理

---

## 1. 数据库查询分析

### 1.1 查询优化 ✅ 良好

| 检查项 | 状态 | 说明 |
|--------|------|------|
| N+1 查询 | ✅ | listSelect 使用 JOIN，无 N+1 问题 |
| 缺失索引 | ✅ | docs 表有 `docs_owner_deleted_order_idx`、`docs_admin_deleted_order_idx` 等综合索引 |
| 分页实现 | ✅ | `DEFAULT_PAGE_SIZE=30, MAX_PAGE_SIZE=50` |
| 排序索引 | ✅ | `ownerId, deletedAt, pinned, updatedAt` 符合常见查询模式 |

### 1.2 发现的问题

#### 【Low】loginFailures 查询未使用覆盖索引

**文件**: `server/src/modules/auth/loginRisk.service.ts`

`lookupIdx` 索引 `(username, scope, dimension)` 包含 `lastFailedAt`，但 `lockedUntil` 查询需回表：

```sql
WHERE username = ? AND scope = ? AND dimension = ?
  AND (locked_until IS NULL OR locked_until < NOW())
```

**建议**: 添加 `(username, scope, dimension, locked_until)` 复合索引。

---

## 2. API 响应时间分析

### 2.1 Gateway 双层序列化开销

**文件**: `server/src/gateway/routes.ts`

Gateway 使用 `app.inject()` 内部转发请求：

```typescript:server/src/gateway/routes.ts
const response = await app.inject({
  method: targetRequest.method,
  url: targetRequest.url,
  payload: hasBody ? JSON.stringify(targetRequest.body ?? {}) : undefined
});
```

**问题**: 请求体被序列化为 JSON 字符串后，再由 Fastify 内部解析，造成双重序列化/反序列化开销。

**影响评估**: Medium — 在高并发场景下可测量，但当前实现简洁易维护。

### 2.2 文档列表 API

**文件**: `server/src/modules/docs/docs.service.ts`

- 列表查询使用合理的分页
- 搜索功能需要全表扫描（无全文索引）—— 对中文支持依赖 `LIKE '%keyword%'`

**影响评估**: Medium — 文档量超过 10 万时搜索性能下降明显。

---

## 3. 前端渲染性能分析

### 3.1 【High】DocListPage 多个 computed 重复遍历

**文件**: `apps/admin/src/pages/docs/DocListPage.vue:74-126`

```typescript
const availableTags = computed(() => Array.from(new Set(allDocs.value.flatMap(docTags))).sort(...));
const visibleDocs = computed(() => { /* 过滤 + 排序 */ });
const totalCount = computed(() => allDocs.value.length);
const publishedCount = computed(() => allDocs.value.filter((doc) => doc.status === "published").length);
const sharedCount = computed(() => allDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled).length);
const reviewCount = computed(() => allDocs.value.filter((doc) => doc.shareReviewStatus === "pending").length);
const draftCount = computed(() => allDocs.value.filter((doc) => doc.status !== "published").length);
const unsharedCount = computed(() => allDocs.value.filter((doc) => !doc.shareCode || !doc.shareEnabled).length);
```

**问题**: 每次 `docs` 数组变化时，8 个 computed 各自独立遍历数组，合计约 8 次完整迭代。

**影响评估**: High — 当文档列表达 500+ 时，每次筛选/排序会产生明显卡顿。

**建议优化**:

```typescript
// 单一派生数据源
const docStats = computed(() => {
  const docs = allDocs.value;
  let published = 0, shared = 0, review = 0, draft = 0, unshared = 0;
  const tags = new Set<string>();
  for (const doc of docs) {
    if (doc.status === "published") published++;
    else draft++;
    if (doc.shareCode && doc.shareEnabled) shared++;
    else unshared++;
    if (doc.shareReviewStatus === "pending") review++;
    docTags(doc).forEach(t => tags.add(t));
  }
  return {
    total: docs.length,
    published, shared, review, draft, unshared,
    availableTags: Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-CN"))
  };
});
```

### 3.2 【Medium】visibleDocs 排序在每次渲染时执行

**文件**: `apps/admin/src/pages/docs/DocListPage.vue:95-99`

排序逻辑在 computed 中，当筛选条件变化时会重新排序。

**影响评估**: Medium — 可使用 `shallowRef` 或虚拟滚动优化长列表渲染。

### 3.3 【Low】正则表达式在循环中创建

**文件**: `apps/admin/src/pages/docs/DocListPage.vue:322`

```typescript
const regex = new RegExp(`(${escaped})`, "gi");
```

**影响评估**: Low — 仅在搜索展示时调用，频率不高。

---

## 4. 资源加载分析

### 4.1 代码分割策略 ✅ 良好

**文件**: `apps/admin/vite.config.ts`

- 编辑器相关代码分割为独立 chunk: `editorShell`, `editorRuntime`, `editorCore`, `editorProsemirror`
- 非编辑器页面 (`docs`, `settings`) 独立 chunk
- 核心认证/会话代码独立 chunk

### 4.2 【Medium】图片资源懒加载

**观察**: `DocListPage.vue:656` 中的用户头像 `<img :src="logoUrl">` 未设置懒加载。

```html
<span v-if="showOwnerColumn" class="doc-list-page__owner">
  <img :src="logoUrl" alt="" />
```

**影响评估**: Medium — 文档列表展示多行时可能触发多图同时加载。

### 4.3 【Low】图标库

使用 `lucide-vue-next`，已实现 tree-shaking，优化良好。

---

## 5. 缓存策略分析

### 5.1 服务端缓存 ✅ 已实现

**文件**: `server/src/modules/shares/shares.service.ts`

```typescript
const DECRYPT_CACHE_TTL_MS = 30 * 1000;   // 30秒解密缓存
const DECRYPT_CACHE_MAX_SIZE = 200;       // 最大 200 条
```

**特点**:
- TTL 过期机制
- LRU 驱逐策略（满时删除 30%）
- 按用户隔离缓存

### 5.2 客户端缓存 ✅ 已实现

**文件**: `apps/admin/src/stores/doc.ts`

```typescript
const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000; // 2 分钟
const detailCache = new Map<string, DetailCacheEntry>();
```

**特点**:
- 详情页缓存，避免重复请求
- 有 TTL 过期机制
- 有主动清理 (`pruneDetailCache`)

### 5.3 【Medium】缓存未覆盖的场景

| 场景 | 当前行为 | 建议 |
|------|----------|------|
| 文档列表缓存 | ❌ 无 | 考虑添加列表级缓存（TTL 60s） |
| 公开页面分享内容 | ✅ 有 30s 缓存 | 合理 |
| 系统设置 | ❌ 每次请求 | 可添加长期缓存（变化不频繁） |

---

## 6. 内存泄漏风险分析

### 6.1 【Low】缓存 Map 无上限保护

**文件**: `apps/admin/src/stores/doc.ts`

```typescript
const detailCache = new Map<string, DetailCacheEntry>();
// 无 maxSize 限制
```

虽然有 TTL 清理，但极端情况下（快速切换大量文档）可能短暂积累。

**建议**: 添加最大条目数限制，类比 `shares.service.ts` 的 `DECRYPT_CACHE_MAX_SIZE = 200`。

### 6.2 【Low】Vue 组件事件监听器

**文件**: `apps/admin/src/pages/docs/DocListPage.vue:444-460`

```typescript
onMounted(() => {
  // 设置多个 localStorage 和初始加载
});
onUnmounted(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
});
```

**观察**: 基础清理完善，但 `loadSystemStatus` 中的 `Promise.allSettled` 如果在组件卸载时仍在进行，结果回写可能触发响应式更新（影响小）。

### 6.3 【Low】搜索防抖定时器

**文件**: `apps/admin/src/pages/docs/DocListPage.vue:430-438`

```typescript
function queueSearch(value: string) {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => { /* ... */ }, 280);
}
```

已正确在 `onUnmounted` 中清理，风险低。

---

## 7. 问题汇总

### 按影响等级分类

| 等级 | 问题 | 文件 | 行号 |
|------|------|------|------|
| **High** | computed 重复遍历数组 | DocListPage.vue | 74-126 |
| **Medium** | Gateway 双层序列化 | routes.ts | 321-329 |
| **Medium** | 中文搜索无全文索引 | docs.service.ts | — |
| **Medium** | 图片未懒加载 | DocListPage.vue | 656 |
| **Medium** | 文档列表无缓存 | doc.ts | — |
| **Low** | loginFailures 索引优化 | loginRisk.service.ts | — |
| **Low** | 详情缓存无上限 | doc.ts | 14 |
| **Low** | 正则表达式循环创建 | DocListPage.vue | 322 |

### 优化优先级

1. **立即处理**: High 问题 — `DocListPage.vue` 的 computed 优化
2. **短期处理**: Medium 问题中的 Gateway 优化（需评估收益）
3. **中期规划**: Medium 问题中的缓存和索引增强
4. **后续跟进**: Low 问题

---

## 8. 已验证的正面实践

- ✅ 数据库索引设计合理，覆盖常见查询模式
- ✅ 服务端缓存实现了 TTL + LRU 驱逐
- ✅ Vite 代码分割策略完善，按功能模块分离
- ✅ 分页实现规范（30 条/页，上限 50）
- ✅ 使用 tree-shakeable 图标库
- ✅ Vue 组件正确使用 `onUnmounted` 清理定时器
- ✅ 文档版本快照有间隔控制（`VERSION_SNAPSHOT_INTERVAL_MS=10min`）

---

**报告生成**: Claude Code Performance Audit
**审计角色**: Performance Optimization Engineer
