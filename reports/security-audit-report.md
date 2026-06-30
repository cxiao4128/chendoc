# ChenDoc 安全漏洞审计报告

**审计时间**: 2026-06-30  
**审计范围**: Gateway 加密链路、JWT 认证、文件上传、权限控制、数据库安全  
**审计结论**: 1 高危、2 中危、2 低危，无严重漏洞

---

## 执行摘要

| 严重程度 | 数量 | 发现的问题 |
|----------|------|------------|
| 🔴 严重 | 0 | - |
| 🟠 高危 | 1 | HMAC 密钥派生未使用 HKDF |
| 🟡 中危 | 2 | 文件上传双扩展名绕过、会话刷新并发 |
| 🟢 低危 | 2 | isSuperAdminDoc 类型宽松、前端路由隔离 |
| ✅ 安全 | - | Gateway 加密、JWT、密码哈希、SQL 防注入 |

---

## 高危问题

### H-1: HMAC 密钥派生未使用 HKDF

**文件**: `server/src/gateway/packet.ts`

**问题描述**: HMAC-SHA256 签名密钥的派生使用简单拼接方式，未采用 HKDF（HMAC-based Key Derivation Function）标准。

**当前代码**:
```typescript
const signatureKey = Buffer.concat([
  this.sessionKey,
  Buffer.from(`:${this.userId}:${this.timestamp}`)
]);
```

**风险**: 直接拼接在理论上允许密钥扩展攻击，HKDF 可提供更好的密钥分离和安全性。

**建议修复**:
```typescript
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const keyMaterial = Buffer.concat([this.sessionKey, Buffer.from(this.userId)]);
const signatureKey = hkdf(sha256, keyMaterial, undefined, 'chendoc-signature', 32);
```

**优先级**: P1 - 建议在下版本升级中实施

---

## 中危问题

### M-1: 文件上传双扩展名绕过风险

**文件**: `server/src/modules/uploads/uploads.service.ts`

**问题描述**: 扩展名校验可能被双扩展名绕过（如 `avatar.jpg.php`）。

**当前防护**: 4 层验证机制（策略、签名、类型、内容签名）

**建议增强**:
```typescript
// 在文件保存前增加最终扩展名检测
const finalExt = path.extname(filename).toLowerCase();
const dangerousExts = ['.php', '.phtml', '.phar', '.js', '.exe', '.sh', '.cgi'];
if (dangerousExts.includes(finalExt)) {
  throw new Error('危险文件类型禁止上传');
}
```

**优先级**: P2 - 可选增强

### M-2: 会话刷新并发容错

**文件**: `server/src/modules/auth/session.service.ts`

**问题描述**: 多端同时刷新会话时可能出现并发冲突，缺少乐观锁或版本号机制。

**建议增强**:
```typescript
// 添加版本号字段
await db.update(sessions)
  .set({
    refreshToken: newToken,
    version: sql`version + 1`
  })
  .where(and(
    eq(sessions.id, sessionId),
    eq(sessions.version, currentVersion) // 乐观锁
  }));
```

**优先级**: P3 - 低优先级，可优化

---

## 低危问题

### L-1: isSuperAdminDoc 类型宽松

**文件**: `server/src/db/schema.ts`

**问题描述**: `isSuperAdminDoc` 字段定义为 `integer` 而非严格的布尔值。

**建议**: 使用 `boolean` 类型并在应用层确保类型一致。

### L-2: 前端路由隔离依赖前端判断

**文件**: `apps/admin/src/router/access.ts`

**问题描述**: 路由权限检查主要依赖前端判断，需确保后端 API 有兜底权限验证。

**确认**: 后端 API 已实现 `documentAccess.ts` 权限控制，前端隔离为辅助层。

---

## 安全亮点

| 模块 | 评估 | 说明 |
|------|------|------|
| Gateway 加密 | ✅ 优秀 | AES-256-GCM + RSA-OAEP 4096-bit |
| 防重放 | ✅ 优秀 | nonce + timestamp + TTL |
| JWT 认证 | ✅ 优秀 | Token 轮换 + session 分离 |
| 密码哈希 | ✅ 优秀 | Argon2id（回退 bcryptjs） |
| SQL 防注入 | ✅ 优秀 | Drizzle ORM 参数化查询 |
| XSS 防护 | ✅ 良好 | sanitize-html 黑名单 |
| 文件上传 | ✅ 良好 | 4 层验证机制 |
| 超级管理员 | ✅ 良好 | 明确边界 + 二次验证 |

---

## 审计文件清单

| 文件 | 用途 |
|------|------|
| `server/src/gateway/packet.ts` | Gateway 加密包处理 |
| `server/src/gateway/middleware.ts` | 请求拦截和验证 |
| `server/src/modules/auth/auth.service.ts` | 认证服务 |
| `server/src/modules/auth/session.service.ts` | 会话管理 |
| `server/src/modules/auth/totp.service.ts` | TOTP 二次验证 |
| `server/src/utils/password.ts` | 密码哈希处理 |
| `server/src/utils/crypto.ts` | 加密工具 |
| `server/src/utils/rsa.ts` | RSA 密钥处理 |
| `server/src/utils/sanitize.ts` | HTML 清洗 |
| `server/src/modules/uploads/uploads.service.ts` | 文件上传服务 |
| `server/src/modules/docs/documentAccess.ts` | 文档权限控制 |
| `apps/admin/src/router/access.ts` | 前端路由权限 |
| `apps/admin/src/gateway/client.ts` | 前端 Gateway 客户端 |

---

*报告由 Claude Code 安全审查角色生成*
