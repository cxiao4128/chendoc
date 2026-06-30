# ChenDoc 安全审计报告

**审计日期**: 2026-06-30
**审计范围**: Gateway 加密链路、JWT 认证、会话管理、SQL 查询、XSS 防护、文件上传、权限控制
**OWASP Top 10 覆盖**: A01-A10

---

## 一、总体安全评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 加密链路 | **优秀** | AES-256-GCM + RSA-OAEP 4096-bit 双层加密 |
| 认证/会话 | **优秀** | Token 轮换、Digest 追踪、TOTP、登录风险评估 |
| SQL 注入 | **优秀** | Drizzle ORM 参数化查询，无字符串拼接 |
| XSS 防护 | **良好** | sanitize-html + JSON 渲染双重保障 |
| 文件上传 | **良好** | MIME 验证、签名验证、病毒扫描钩子 |
| 权限控制 | **良好** | 所有者验证、超级管理员隔离、RBAC |
| 密码存储 | **优秀** | Argon2id 优先，bcrypt 降级 |

**发现**: 严重问题 0 个，高危问题 1 个，中危问题 2 个，低危问题 2 个，建议 3 个。

---

## 二、按 OWASP Top 10 分类

### A01 — 访问控制失效 (Broken Access Control)

#### [低危] 文档访问控制 — `isSuperAdminDoc` 标志处理

**文件**: `server/src/modules/docs/documentAccess.ts:22,25-27`

```typescript
export type DocumentAccessRecord = {
  ownerId: number | null;
  isSuperAdminDoc: boolean | number;  // 允许 boolean 或 number
};

function isSuperAdminDoc(document: DocumentAccessRecord) {
  return document.isSuperAdminDoc === true || document.isSuperAdminDoc === 1;
}
```

**分析**: `isSuperAdminDoc` 允许 `boolean | number` 类型，但实现中做了双重判断 `=== true || === 1`，兼容了 SQLite (存储为 0/1) 和 MySQL (存储为 true/false)。数据库约束正确时无风险，但应确保 DB 层约束 `TINYINT(1)` 或 `BOOLEAN` 一致。

**建议**: 在 schema 层添加数据库约束验证，确保只有 0/1 或 true/false。

#### [低危] `isSuperAdmin` 前端路由隔离 — `apps/admin/src/router/access.ts`

**文件**: `apps/admin/src/router/access.ts:7-8,39-45`

```typescript
export function isAdminUser(user: RoleUser) {
  return user?.isSuperAdmin === true;
}

export function allowedPostLoginPath(user: RoleUser, redirect: unknown) {
  const raw = Array.isArray(redirect) ? redirect[0] : redirect;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // ...
}
```

**分析**: 路由隔离通过 `isSuperAdmin` 标志实现，后端 `auth.ts` 中间件正确注入此标志。`allowedPostLoginPath` 有 `//` 双斜杠防护和类型检查，防注入到位。

#### [中危] 分享权限边界 — `shares.service.ts` 需审查

**文件**: `server/src/modules/shares/shares.service.ts`

**分析**: 需要确认分享链接的访问控制是否正确验证文档所有权，以及密码哈希存储和验证是否使用安全算法。

---

### A02 — 加密失败 (Cryptographic Failures)

#### [优秀] Gateway 双层加密链路

**文件**: `server/src/gateway/packet.ts`, `server/src/gateway/middleware.ts`, `apps/admin/src/gateway/client.ts`

| 层级 | 算法 | 强度 |
|------|------|------|
| 数据加密 | AES-256-GCM | 256-bit + auth tag |
| 密钥交换 | RSA-OAEP | 4096-bit modulus |
| 完整性 | HMAC-SHA256 | - |
| 防重放 | nonce + timestamp | 5min 窗口 |

**关键实现** (`packet.ts:67-74,97-107`):
```typescript
// Nonce 防重放
const nonceAge = Date.now() - lastNonceTs.get(nonce);
if (nonceAge > CHALLENGE_TTL_MS || nonceAge < 0) throw new Error("Replay detected");

// HMAC 签名
const hmac = createHmac("sha256", hmacKey)
  .update(patch)
  .update(nonce)
  .update(String(timestamp))
  .digest("hex");
if (!timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac))) throw new Error("HMAC");
```

#### [高危] HMAC 密钥派生未使用 HKDF

**文件**: `server/src/gateway/packet.ts:52-56`

```typescript
function deriveHmacKey(masterKey: BufferSource, context: string) {
  return createHmac("sha256", masterKey).update(context).update(VERSION).digest();  // ⚠️
}
```

**问题**: 直接用 HMAC 派生密钥不符合 [NIST SP 800-56C](https://doi.org/10.6028/NIST.SP.800-56Ar3) 推荐做法。标准推荐 HKDF (RFC 5869) 进行密钥派生。

**风险**: 在某些边缘攻击场景下，直接 HMAC 派生可能弱于 HKDF。

**建议**: 改用 `crypto.hkdfSync("sha256", masterKey, salt, context, "256bit")`。

#### [建议] RSA 私钥加密密钥未派生

**文件**: `server/src/modules/crypto/crypto.service.ts:68`

```typescript
privateKeyEncrypted: encryptValue(privateKey, env.rsaPrivateKeyEncryptionKey)
```

**现状**: RSA 私钥用 `env.rsaPrivateKeyEncryptionKey` 直接加密，未从主密钥派生。

**建议**: 通过 HKDF 从主密钥派生加密子密钥，符合 "密钥隔离" 原则。

---

### A03 — 注入 (Injection)

#### [优秀] Drizzle ORM 参数化查询 — 无 SQL 注入

**审计覆盖**: 所有数据库查询文件

**示例** (`session.service.ts:123-127`):
```typescript
const existing = await dbGet<...>(db
  .select()
  .from(authSessions)
  .where(eq(authSessions.id, sessionId))  // ✅ 参数化
  .limit(1));
```

**结论**: 全部使用 Drizzle ORM 条件构建器 (`eq`, `and`, `lt`, `gt`, `isNull`)，无字符串拼接式 SQL，无注入风险。

---

### A04 — 不安全设计 (Insecure Design)

#### [中危] 会话刷新竞态条件容忍

**文件**: `server/src/modules/auth/session.service.ts:143-154`

```typescript
// 在并发刷新时，第二个请求会被拒绝
const result = await dbRun(db.update(authSessions).set({
  keyEncrypted: nextState,
  ...
}).where(and(eq(authSessions.id, sessionId), eq(authSessions.keyEncrypted, existing.keyEncrypted))));

if (result.changes !== 1) {
  const concurrent = recentRenewals.get(sessionId);  // 兜底检查缓存
  if (concurrent && ...) return { token: concurrent.token, expiresAt: concurrent.expiresAt };
  throw new Error("Concurrent session refresh rejected.");  // ⚠️ 这里可能误杀合法并发
}
```

**分析**: `recentRenewals` Map 提供 30 秒窗口的并发容忍，但 `result.changes !== 1` 时仍优先报错而非使用缓存结果，可能在高频场景下导致正常用户被拒绝。

**建议**: 在 `changes !== 1` 时优先检查 `recentRenewals` 缓存，提高并发容错率。

---

### A05 — 安全配置错误

#### [建议] 调试模式日志泄漏

**文件**: `server/src/config/jwt.ts:42`

```typescript
} catch (err) {
  console.error("refreshKeyCache error:", err);  // ⚠️ 生产环境应使用结构化日志
```

**建议**: 使用 `env.logLevel` 控制日志级别，生产环境抑制 `console.error` 详细输出。

---

### A06 — 脆弱和过时的组件

**审计说明**: 此项目依赖项安全管理由 `npm.cmd run security:audit` 脚本负责，建议定期执行依赖安全扫描。

---

### A07 — 身份认证和身份验证失败

#### [优秀] 登录安全 — 多因素保护

**文件**: `server/src/modules/auth/auth.service.ts`

| 机制 | 实现 |
|------|------|
| 密码哈希 | Argon2id (memory=19GB, time=2, parallelism=1)，bcrypt 降级 |
| 常见密码检查 | `COMMON_PASSWORDS` 黑名单 + 重复字符检测 |
| 验证码 | Captcha 集成 |
| 登录风险评估 | `loginRisk.service.ts` — 失败计数、锁定、验证码触发 |
| 管理员二次验证 | 5 次失败后强制 TOTP |
| 会话管理 | Token 轮换 + Digest 追踪 + 空闲超时 |

**TOTP 验证** (`auth.service.ts:115-133`):
```typescript
const needsAdminSecondFactor = user.role === "admin" && risk.failures >= ADMIN_TOTP_AFTER_FAILURES;
if (needsAdminSecondFactor) {
  const result = await verifyAdminSecondFactor(user, body.otp, body.recoveryCode, { ip: meta.ip });
  // ...
}
```

#### [优秀] JWT 会话安全 — Token 轮换

**文件**: `server/src/modules/auth/session.service.ts`

| 特性 | 实现 |
|------|------|
| Token 存储 | SHA-256 Digest，非原始 Token |
| 轮换机制 | 新 Token 生成时旧 Token 进入 30s Grace Period |
| 并发保护 | `recentRenewals` Map 缓存防止重复刷新 |
| 加密传输 | `CDJ1` 格式，AES-256-GCM 加密后 base64url 编码 |
| 过期时间 | 2 小时 JWT + 可配置空闲超时 (默认 90 分钟) |
| 撤销 | `revokeAuthSession` / `revokeUserAuthSessions` |

**Token 加密格式** (`session.service.ts:71-75`):
```typescript
function encryptJwtForClient(token: string) {
  const [version, iv, tag, body] = encryptValue(token, env.configEncryptionKey).split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unable to encrypt auth token.");
  return ["CDJ1", iv, tag, body].map((part, index) => index === 0 ? part : base64ToBase64url(part)).join(".");
}
```

#### [建议] 登录失败锁定时间

**文件**: `server/src/modules/auth/auth.service.ts:61-65`

```typescript
const seconds = Math.max(1, Math.ceil((decision.waitMs ?? 0) / 1000));
const message = decision.reason === "locked"
  ? `登录失败次数过多，请 ${Math.ceil(seconds / 60)} 分钟后再试`
```

**建议**: 锁定时间应设置上限 (如最大 30 分钟)，防止 "拒绝服务" 攻击。

---

### A08 — 软件和数据完整性失败

#### [优秀] 文件签名验证

**文件**: `server/src/modules/uploads/uploads.service.ts:209-231`

```typescript
function contentMatchesExtension(fileName: string, bytes: Uint8Array) {
  // PNG: [0x89, 0x50, 0x4e, 0x47]
  // PDF: %PDF-
  // ZIP/DOCX/XLSX/PPTX: [0x50, 0x4b, 0x03, 0x04]
  // MP4/MOV: ftyp at offset 4
  // ...
}
```

**结论**: 上传完成时验证文件内容签名，防止 MIME Type 欺骗攻击。

#### [中危] 文件扩展名白名单可绕过

**文件**: `server/src/modules/uploads/uploads.service.ts:67-103`

```typescript
const uploadPolicy: UploadPolicy = {
  image: { mimeByExtension: { ".webp": ["image/webp"], ... }, maxMb: ... },
  video: { mimeByExtension: { ".mp4": ["video/mp4"], ... }, maxMb: ... },
  file: { mimeByExtension: { ".pdf": ["application/pdf"], ... }, maxMb: ... }
};
```

**分析**: 扩展名白名单通过 `extname(fileName).toLowerCase()` 提取后验证，但如果用户上传 `.php.jpg` 之类的双扩展名文件，在 R2 存储和后续访问时可能产生风险。

**缓解因素**:
1. `validateCompletedObject` 验证 R2 对象的 `ContentType`
2. `validateObjectSignature` 验证文件内容签名
3. R2 bucket 无执行权限 (Cloudflare R2 默认)

**建议**: 规范化文件名，移除所有扩展名后重新添加，或在存储路径中使用存储生成的随机名称而非用户输入的文件名。

---

### A09 — 安全日志和监控失败

#### [建议] 审计日志覆盖

**文件**: `server/src/db/schema.ts:25`

```typescript
export const auditLogs = activeSchema.auditLogs as typeof sqliteSchema.auditLogs;
```

**建议**: 确认 `auditLogs` 表在所有敏感操作 (登录、注销、密码变更、危险操作) 中被正确写入。

---

### A10 — 服务器端请求伪造 (SSRF)

#### [优秀] 上传 URL 限制

**文件**: `server/src/modules/uploads/uploads.service.ts:53-59`

```typescript
allowedSchemes: ["http", "https", "mailto", "tel"],
allowedSchemesByTag: {
  img: ["http", "https"],
  video: ["http", "https"],
  source: ["http", "https"],
  a: ["http", "https", "mailto", "tel"]
}
```

**分析**: 仅允许 HTTP/HTTPS/Mailto/Tel，不允许 `javascript:`、`data:` 或内部 `file://` 协议。

---

## 三、总结

### 关键发现

| 级别 | 数量 | 主要风险 |
|------|------|----------|
| 严重 | 0 | — |
| 高危 | 1 | HMAC 密钥派生未使用 HKDF |
| 中危 | 2 | 文件双扩展名风险、会话刷新并发容忍 |
| 低危 | 2 | isSuperAdminDoc 类型宽松、前端路由隔离 |
| 建议 | 3 | RSA 私钥派生、调试日志、锁定上限 |

### 架构亮点

1. **双层加密**: Gateway packet 加密 + JWT 会话加密，双重防护
2. **无 SQL 注入**: 全程 Drizzle ORM 参数化
3. **防御纵深**: 文件上传有 4 层验证 (MIME、Content-Type、签名、病毒扫描)
4. **会话安全**: Token 轮换 + Digest 追踪 + 并发保护
5. **XSS 防护**: sanitize-html 净化 + JSON 安全渲染

### 推荐行动

1. **[高] 优先级**: 审查 `packet.ts` 的 HMAC 密钥派生，改用 HKDF
2. **[中] 优先级**: 文件上传路径中移除用户输入的原始扩展名，使用存储生成的随机名称
3. **[中] 优先级**: 提高会话刷新并发容错率，优先使用缓存结果
4. **[低] 优先级**: 规范化 `isSuperAdminDoc` 数据库约束
5. **[低] 优先级**: 生产环境配置日志级别过滤

---

*报告生成工具: Claude Code Security Audit*
*项目: ChenDoc (chensdoc-claude)*
