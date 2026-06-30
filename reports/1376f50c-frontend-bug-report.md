# ChenDoc 前端代码 Bug 检查报告

**任务**: 1376f50c-b8f4-4129-b3e4-e70f47f359e1
**分析人**: 全栈工程师
**日期**: 2026-06-30
**范围**: `apps/admin` 前端 Vue 代码

---

## P0 - 严重 (必须修复)

### 1. AES 密钥泄露风险
**文件**: `apps/admin/src/gateway/client.ts:311-312`
**问题**: `packGatewayBody` 返回结果暴露 `aesKey`，客户端可解密所有加密响应

```typescript
return {
  data: encryptedData,
  key: aesKey  // <-- 这里不应该返回密钥
};
```

**影响**: 加密链路形同虚设，攻击者可获取所有敏感数据
**建议**: 删除返回对象中的 `key` 字段，密钥仅在内部使用

---

## P1 - 高优先级

### 2. fetchMe 竞态条件
**文件**: `apps/admin/src/stores/auth.ts:35-36`
**问题**: 多个并发 `fetchMe()` 调用可能创建多个 inflight promise

```typescript
async function fetchMe(force = false) {
  if (!force && ready.value && user.value && Date.now() - lastFetchedAt < ME_CACHE_TTL_MS) return user.value;
  if (inflightMe) return inflightMe;  // 锁机制存在但返回的是旧 inflightMe
  // ...
  inflightMe = (async () => {
    // ...
  })();
  return inflightMe;
}
```

**影响**: 并发调用时可能返回过期用户数据
**建议**: 确保 `inflightMe` 设置在返回之前完成，或使用更严格的锁机制

### 3. loadDoc 缓存逻辑不清晰
**文件**: `apps/admin/src/stores/doc.ts:95`
**问题**: docUid 不匹配时设置 `current.value = null` 的逻辑不清晰

```typescript
const loadDoc = async (docUid: string) => {
  if (current.value?.doc?.uid !== docUid) {
    current.value = null;
  }
  // ...
};
```

**影响**: 缓存失效逻辑可能与预期不符，导致不必要的数据重载
**建议**: 明确注释说明缓存失效条件

---

## P2 - 中优先级

### 4. useDocAutosave 缺少错误处理
**文件**: `apps/admin/src/composables/useDocAutosave.ts`
**问题**: 自动保存失败时没有用户反馈机制

### 5. useUpload 错误边界
**文件**: `apps/admin/src/composables/useUpload.ts`
**问题**: 上传失败后文件状态不一致，可能导致 UI 显示过期

### 6. DocEditorPage 组件卸载清理
**文件**: `apps/admin/src/pages/DocEditorPage.vue`
**问题**: 组件卸载时需确保 clearTimeout 清理定时器

### 7. SettingsPage 版本号硬编码
**文件**: `apps/admin/src/pages/SettingsPage.vue`
**问题**: `APP_VERSION` 应从构建元数据读取，而非硬编码

### 8. useShare 内存泄漏风险
**文件**: `apps/admin/src/composables/useShare.ts`
**问题**: 事件监听器未在 cleanup 中移除

### 9. DocListPage 分页状态
**文件**: `apps/admin/src/pages/DocListPage.vue`
**问题**: 路由切换时分页状态未正确保存/恢复

---

## 总结

| 级别 | 数量 | 说明 |
|------|------|------|
| P0   | 1    | 严重安全问题 |
| P1   | 2    | 高优先级功能缺陷 |
| P2   | 7    | 中优先级优化项 |

**最紧急**: 修复 AES 密钥泄露 (P0) 和竞态条件 (P1)
