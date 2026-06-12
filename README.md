# ChenDoc / 陈书

当前版本 / Current version: `v2.5.0`

语言 / Language: [中文](#中文) | [English](#english)

## 中文

### 项目简介

ChenDoc / 陈书 是一个轻量化自托管文档管理平台，面向个人站点、小团队资料库和内部知识发布场景。

核心能力：

- 文档创建、编辑、搜索、回收站和历史版本。
- 公开分享、访问密码、短码访问和分享审核。
- 注册卡密、用户管理、操作日志和产品控制中心。
- Cloudflare R2 / S3 兼容对象存储。
- 生产环境固定使用 MySQL，SQLite 仅保留为本地测试和历史迁移用途。

### 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、TipTap。
- 后端：Node.js 20+、Fastify、TypeScript、Drizzle ORM。
- 数据库：MySQL。
- 存储：Cloudflare R2 或其他 S3 兼容对象存储。

### 快速开始

```bash
npm ci --workspaces --include-workspace-root
cp .env.example .env
npm run db:migrate
npm run dev
```

默认前端开发服务运行在 `5175`，后端端口由 `.env` 中的 `PORT` 控制。

### 构建

```bash
npm run build
```

构建会生成管理端产物，并复制到 `server/public/admin` 供后端托管。

### 生产部署

服务器使用 MySQL。部署前必须在根目录 `.env` 中配置：

```env
DATABASE_PROVIDER=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:3306/chendoc
PUBLIC_SITE_URL=https://your-domain.example
JWT_SECRET=replace_with_32_bytes_or_more
CONFIG_ENCRYPTION_KEY=replace_with_32_bytes_or_more
RSA_PRIVATE_KEY_ENCRYPTION_KEY=replace_with_32_bytes_or_more
CHENDOC_DOCUMENT_ENCRYPTION_KEY=replace_with_32_bytes_or_more
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=replace_with_strong_password
```

部署命令：

```bash
bash ./deploy.sh
```

`deploy.sh` 会检查 Node.js、生产密钥、MySQL 配置、端口、依赖审计、数据库备份、数据库迁移、构建和 PM2 启动。

反向代理目标：

```text
http://127.0.0.1:8985
```

### 常用命令

```bash
npm run dev              # 本地开发
npm run build            # 构建前端和后端
npm run db:backup        # 数据库备份
npm run db:migrate       # 数据库迁移
npm run admin:init       # 初始化或修复管理员账号
bash ./deploy.sh         # 部署并重启服务
bash ./start.sh          # 启动已构建服务
bash ./stop.sh           # 停止服务
```

### 安全说明

- 不要提交 `.env`、数据库、日志、部署密钥或备份文件。
- 首次部署后请确认管理员密码、JWT 密钥、配置加密密钥、RSA 私钥加密密钥和文档加密密钥均已替换。
- R2 Access Key 和 Secret 只保存在服务端配置中，前端不会直接暴露密钥。
- 上线前建议测试登录、公开分享、分享审核、注册卡密、R2 上传和管理员安全中心。

### 更新日志

#### 2.5.0

版本号：`2.5.0`

展示版本：`v2.5.0`

本次更新内容：

- 架构更新版本，根项目、管理端、服务端、锁文件和系统展示版本已同步到 `2.5.0`。
- 强化 Gateway Packet Layer：动态 `keyId`、挑战绑定、HMAC-SHA256 签名、nonce/timestamp 防重放和加密响应链路。
- 强化登录安全：登录风险跟踪、TOTP、危险操作二次验证、单次恢复码和安全中心管理页。
- 新增文档内容 AES-256-GCM 静态加密，支持历史文档加密迁移脚本。
- 优化公开分享首屏、ETag / Last-Modified 缓存、密码分享页和分享审核链路。
- 更新部署预检和 `deploy.sh`，生产部署强制使用 `DATABASE_PROVIDER=mysql` 与 `mysql://` 连接串。
- 增加安全 CI、服务端测试覆盖、日志脱敏和统一错误处理。

更新时间：2026-06-13 02:05:23 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

#### 2.3.0

- 按定版 PNG 落地 ChenDoc 浅紫 UI，统一登录页、文档工作台、回收站、分享审核和系统管理视觉。
- 登录页换用定版壁纸与半透明登录面板。
- 后台补齐顶部搜索、快捷入口、横版 ChenDoc wordmark、淡紫选中导航、用户头像和独立退出入口。

#### 2.2.0

- 建立 ChenDoc 商业化文档系统设计语言。
- 登录、后台、编辑器、分享页和控制中心统一到更成熟的文档平台体验。
- 保持轻量 Vue / CSS 实现，不引入大型 UI 框架或外链字体资源。

#### 2.1.0

- Gateway Packet Layer 升级为外层 AES-GCM 加密封套。
- 请求和响应统一通过 `/api/gateway` 加密传输。
- 动作码路由替代生产环境可读业务路由。

#### 1.x

- 完成 MySQL 生产运行、R2 上传、公开分享、回收站、注册卡密、登录验证码和基础管理后台。

## English

### Overview

ChenDoc / Chen Shu is a lightweight self-hosted document management platform for personal sites, small teams, and internal knowledge publishing.

Main features:

- Document editing, search, recycle bin, and version history.
- Public sharing, share passwords, short codes, and share review.
- Invite codes, user management, operation logs, and product control center.
- Cloudflare R2 / S3-compatible object storage.
- MySQL for production. SQLite remains only for local testing and historical migration.

### Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, TipTap.
- Backend: Node.js 20+, Fastify, TypeScript, Drizzle ORM.
- Database: MySQL.
- Storage: Cloudflare R2 or another S3-compatible service.

### Local Development

```bash
npm ci --workspaces --include-workspace-root
cp .env.example .env
npm run db:migrate
npm run dev
```

### Production

Production uses MySQL. Configure the root `.env` first:

```env
DATABASE_PROVIDER=mysql
DATABASE_URL=mysql://user:password@127.0.0.1:3306/chendoc
PUBLIC_SITE_URL=https://your-domain.example
JWT_SECRET=replace_with_32_bytes_or_more
CONFIG_ENCRYPTION_KEY=replace_with_32_bytes_or_more
RSA_PRIVATE_KEY_ENCRYPTION_KEY=replace_with_32_bytes_or_more
CHENDOC_DOCUMENT_ENCRYPTION_KEY=replace_with_32_bytes_or_more
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=replace_with_strong_password
```

Deploy:

```bash
bash ./deploy.sh
```

Reverse proxy target:

```text
http://127.0.0.1:8985
```

### Changelog

#### 2.5.0

- Architecture update release. Root, admin, server, lockfile, and displayed version are synchronized to `2.5.0`.
- Hardened Gateway Packet Layer with dynamic `keyId`, challenge binding, HMAC-SHA256 signing, nonce/timestamp replay protection, and encrypted responses.
- Added login risk tracking, TOTP, dangerous-operation re-verification, recovery codes, and the admin security center.
- Added AES-256-GCM document encryption at rest and migration scripts for existing documents.
- Improved public share first paint, ETag / Last-Modified caching, password-protected share pages, and share review.
- Updated deployment preflight and `deploy.sh` to require `DATABASE_PROVIDER=mysql` and a `mysql://` `DATABASE_URL`.
- Added security CI, server-side test coverage, log redaction, and unified error handling.

Updated at: 2026-06-13 02:05:23 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)