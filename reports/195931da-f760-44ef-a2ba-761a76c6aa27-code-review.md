# ChenDoc 代码审查报告

**项目路径**: `d:/desktop/bixu/js/chensdoc-claude`
**审查范围**: `apps/admin` (Vue 3/Vite) + `server` (Fastify)
**审查维度**: 代码逻辑正确性、错误处理完整性、可维护性、Bug 检测、最佳实践
**生成时间**: 2026-06-30

---

## 一、架构概览

| 模块 | 技术栈 | 文件数 |
|------|--------|--------|
| Gateway 加密层 | RSA-OAEP + AES-256-GCM | 前端 + 后端 |
| 认证 | JWT + HttpOnly Cookie | 前端 + 后端 |
| 文档管理 | Drizzle ORM (MySQL/SQLite) | 后端 |
| 表单系统 | 25+ 字段类型 | 后端 |
| 对象存储 | R2 预签名 URL | 后端 |
| 公开分享 | 密码保护 + 暴力破解防护 | 后端 |

---

## 二、发现的问题

### 🔴 高风险 (High Risk)

#### 1. Gateway 客户端重放攻击防护不足
**文件**: `apps/admin/src/gateway/client.ts`
**位置**: 第 150-220 行
**问题**: nonce 由 `Date.now() + Math.random()` 生成，精度受限且可预测
```typescript
// 当前实现
const nonce = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
```
**影响**: 在高精度计时场景下，攻击者可能预测 nonce 并重放旧请求
**建议**: 使用 `crypto.getRandomValues()` 生成 16 字节随机数，转为 base64

---

#### 2. 表单提交 IP 限流绕过风险
**文件**: `server/src/modules/forms/forms.service.ts`
**位置**: 第 280-320 行
**问题**: IP 提取依赖 `request.headers['x-forwarded-for']`，攻击者可伪造
```typescript
const ip = (request.headers['x-forwarded-for'] as string | undefined)
  ?.split(',')[0]?.trim() ?? request.ip;
```
**影响**: 攻击者可通过伪造 X-Forwarded-For 绕过 IP 限流
**建议**:
- 信任链验证：仅在已认证反向代理环境下使用
- 或使用反向代理设置的真实 IP 头（如 `X-Real-IP`）并配置信任代理列表
- 考虑增加客户端指纹 + IP 的双重校验

---

#### 3. 文档加密密钥管理风险
**文件**: `server/src/utils/documentCrypto.ts`
**问题**: 加密密钥在内存中处理，若服务端存在 SSRF 或日志注入，可能泄露
**建议**:
- 确保密钥不在错误日志中打印
- 考虑使用 HSM/KMS 管理密钥
- 添加密钥轮换机制

---

### 🟡 中风险 (Medium Risk)

#### 4. 分享码缓存 TTL 不一致
**文件**: `server/src/modules/shares/shares.service.ts`
**位置**: 第 120-150 行 vs 第 180-210 行
**问题**:
- 暴力破解防护 TTL: 15 分钟
- 密码尝试记录 TTL: 15 分钟
- 文档解密缓存 TTL: 30 秒
```typescript
// 暴力破解防护
const lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 分钟
// 文档解密缓存
shareCache.set(shareCode, { ... });
setTimeout(() => shareCache.delete(shareCode), 30_000); // 30 秒
```
**影响**: 时间窗口不一致可能导致防护逻辑出现竞态
**建议**: 统一使用配置常量定义 TTL

---

#### 5. JWT 密钥轮换缺失
**文件**: `server/src/modules/auth/auth.routes.ts`
**位置**: 第 50-100 行
**问题**: JWT 签名密钥 (`env.jwtSecret`) 无轮换机制
**影响**: 密钥泄露后无法吊销已发放的会话
**建议**:
- 实现 JWT 密钥版本号 (`kid`)
- 支持多密钥验证（允许新旧密钥同时有效）
- 定期轮换时保留旧密钥用于验证

---

#### 6. 上传文件签名验证未强制
**文件**: `server/src/modules/uploads/uploads.service.ts`
**位置**: 第 233-244 行
**问题**: `validateObjectSignature` 验证失败会删除对象，但验证是可选项
```typescript
try {
  await validateObjectSignature(client, config, tokenPayload);
} catch (error) {
  await client.send(new DeleteObjectCommand({ ... }));
  throw error;
}
```
**建议**: 考虑将签名验证作为必选项而非可选项

---

#### 7. 表单字段 JSON Schema 注入风险
**文件**: `server/src/modules/forms/forms.service.ts`
**位置**: 第 400-450 行
**问题**: 动态生成 JSON Schema 时使用用户输入拼接
**建议**: 确保所有用户输入经过严格验证后再拼接

---

#### 8. 错误信息泄露
**文件**: `server/src/plugins/error-handler.ts`
**位置**: 第 60-80 行
**问题**: 非生产环境下暴露完整堆栈
```typescript
if (env.NODE_ENV !== 'production') {
  error.stack && reply.send({ error: error.stack });
}
```
**建议**: 仅在开发/测试环境暴露堆栈，生产环境记录到日志

---

### 🟢 低风险 (Low Risk)

#### 9. 硬编码魔法数字
**文件**: 多处
**问题**:
```typescript
// uploads.service.ts
REFRESH_SKEW_MS = 10 * 60 * 1000; // 10 分钟
// shares.service.ts
const lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 分钟
// packet.ts
TTL: 5 * 60 * 1000, // 5 分钟
```
**建议**: 统一使用配置文件或环境变量

---

#### 10. 缓存未设置大小限制
**文件**: `server/src/gateway/packet.ts`
**位置**: 第 30-50 行
**问题**: nonceReplayMap 和 challengeStore 仅通过 TTL 清理，无大小限制
```typescript
const nonceReplayMap = new Map<string, number>();
const challengeStore = new Map<string, ChallengeData>();
```
**影响**: 内存增长风险
**建议**: 添加最大条目数限制，超出时清除最旧条目

---

#### 11. 会话恢复 Token 传输
**文件**: `apps/admin/src/api/request.ts`
**位置**: 第 50-80 行
**问题**: 登录成功后将 token 存储在 JavaScript 内存，通过 Authorization header 发送
**建议**: 考虑使用 HttpOnly Cookie 传输业务 Token，增强 XSS 防护

---

## 三、安全最佳实践合规情况

| 实践项 | 状态 | 备注 |
|--------|------|------|
| SQL 注入防护 | ✅ | Drizzle ORM 参数化查询 |
| XSS 防护 | ✅ | HTML 强制清洗 |
| CSRF 防护 | ✅ | SameSite Cookie + 请求签名 |
| 密码存储 | ✅ | bcrypt 哈希 |
| 敏感数据加密 | ✅ | AES-256-GCM 文档加密 |
| 速率限制 | ⚠️ | 表单 IP 限流存在绕过风险 |
| 会话管理 | ✅ | JWT + 自动刷新 |
| 错误处理 | ⚠️ | 非生产环境暴露堆栈 |

---

## 四、代码质量观察

### 优点
1. **架构清晰**: Gateway 分层设计合理，加解密逻辑独立
2. **类型安全**: 广泛使用 TypeScript + Zod 验证
3. **错误处理**: 自定义错误类层次清晰
4. **并发控制**: 上传用户锁防止竞态条件
5. **乐观锁**: 文档版本控制设计合理

### 可改进
1. **配置外化**:魔法数字应移至配置
2. **日志规范**: 缺少统一的结构化日志
3. **测试覆盖**: 建议增加集成测试覆盖关键路径
4. **监控告警**: 缺少关键指标埋点

---

## 五、总结

| 风险等级 | 数量 |
|----------|------|
| 🔴 高风险 | 3 |
| 🟡 中风险 | 5 |
| 🟢 低风险 | 5 |

**整体评价**: 代码架构设计合理，安全意识较好。主要风险集中在 IP 限流绕过和 nonce 生成可预测性。建议优先修复高风险问题。

---

*审查完成时间: 2026-06-30*