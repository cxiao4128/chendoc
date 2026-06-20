# 收集表威胁模型与测试矩阵

边界：公开填写页 `/f/:formUid` 独立开放；私有 `/api/forms/**` 必须走 Gateway 并完成登录鉴权。

主要威胁：超额并发提交、重复提交、字段注入、验证码绕过、原始 IP/浏览器信息过度保存、公开页 XSS/CSP 失效、越权读取或删除提交。

控制：事务内条件计数、提交者摘要唯一约束、字段白名单、第三次同源提交验证码、IP 不可逆摘要、User-Agent 默认不保存、nonce CSP、owner/admin 权限检查、保留期清理和计数校准。

自动测试：

- `forms.service.test.ts`：上限、重复、字段白名单、验证码、计数下限。
- `forms.public.routes.test.ts`：公开页 CSP、单同意框/多选题、公开提交。
- `schema.contract.test.ts`：SQLite/MySQL 列、类型、默认值、索引和外键一致。
- `e2e/core-flows.spec.ts`：公开表单浏览器提交。
