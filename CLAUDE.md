# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ChenDoc 上下文优先看 `chendoc/超记忆副本.md`，再按任务读具体源码。

## Core

- Root: `D:\desktop\bixu\js\chensdoc-claude`
- 用户界面默认中文。
- 个人文档管理和知识发布系统。**不做**：企业 OA、团队协作、CRM、营销页、AI 仪表盘。
- Workspaces: `apps/admin` (Vue 3/Vite/Pinia/Vue Router/TipTap), `server` (Fastify 5/Drizzle)
- 生产数据库: MySQL。SQLite 仅用于本地/测试/历史迁移。

## Commands (Windows: use `npm.cmd`)

```powershell
# 开发
npm.cmd ci --workspaces --include-workspace-root
npm.cmd run dev              # 全量构建 + SQLite 启动
npm.cmd run dev:server       # 仅后端开发
npm.cmd run dev:admin        # 仅前端构建

# 构建
npm.cmd run build            # 前端 + 后端全量构建
npm.cmd --prefix apps/admin run build
npm.cmd --prefix server run build

# 测试
npm.cmd --workspace @chendoc/server run test

# 数据库
npm.cmd run db:migrate
npm.cmd run migrate:sqlite-to-mysql

# 部署
npm.cmd run deploy:preflight
bash ./deploy.sh
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh  # 重建管理员
```

## Must Keep

- **Gateway**: 生产 API 统一走 `POST /api/gateway`，请求/响应保持 packet-wrapped 加密。
- **JWT**: 加密后放在 `Authorization`；禁止恢复 Cookie 或 session storage。
- **R2/分享**: 不改上传和公开分享访问边界，除非明确任务和测试。
- **权限**: 不绕过用户禁用、注销、权限提升、超级管理员边界。
- **禁止手改**: `apps/admin/dist`、`server/dist`、`server/public/admin`、`node_modules/`。
- **保留后台入口**: docs, trash, review, security, templates, knowledge, settings, invites, R2, danger delete。

## Architecture

### Gateway 加密链路
```
Client (gateway/client.ts)
    ↓ AES-256-GCM 加密请求
POST /api/gateway
    ↓ RSA-OAEP 密钥交换 + HMAC-SHA256 + nonce/timestamp 防重放
Server (server/src/gateway/*)
    ↓ Fastify inject() 分发
Internal endpoints
```

### 关键文件

| 用途 | 文件 |
| --- | --- |
| 变更规范 | `chendoc/更改必读规范.md` |
| 项目记忆 | `chendoc/超记忆副本.md` |
| 路由权限 | `apps/admin/src/router/access.ts` |
| Gateway 前端 | `apps/admin/src/gateway/client.ts` |
| Gateway 后端 | `server/src/gateway/routes.ts`, `middleware.ts`, `packet.ts` |
| 数据库 Schema | `server/src/db/schema.ts`, `schema.mysql.ts`, `schema.sqlite.ts` |
| 公开分享 | `server/src/modules/public/renderShareHtml.ts` |
| 文档加密 | `server/src/utils/documentCrypto.ts` |

## 版本管理

完整 semver (`x.y.z`)：
- `x`: 核心架构/数据模型/认证体系
- `y`: 新功能/安全增强/构建优化
- `z`: Bug/文案/样式修复

版本必须同步: `package.json`, `apps/admin/package.json`, `server/package.json`, `package-lock.json`, `SettingsPage.vue` 的 `APP_VERSION`, `README.md`, `CHANGELOG.md`

## 安全

- 登录安全: 验证码、登录风险跟踪、TOTP、危险操作二次验证、恢复码、会话清理
- 文档加密: AES-256-GCM 静态加密 (`server/src/utils/documentCrypto.ts`)
- 分享清洗: `server/src/utils/sanitize.ts` 强制清洗 HTML
- 安全审计: `npm.cmd run security:audit`

## Scripts

- `admin:init` - 初始化/修复管理员
- `r2:import` - 导入 R2 配置
- `html:resanitize` - 重新清洗已存 HTML
- `db:backup` - 数据库备份