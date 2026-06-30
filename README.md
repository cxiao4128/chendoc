# ChenDoc / 陈书

> 安全边界：单站点、多账号。当前不提供多租户隔离；`tenantKey` 不是租户安全边界。

当前版本 / Current version: `v3.0.0`

语言 / Language: [中文](#中文) | [English](#english)

## 中文

### 项目简介

ChenDoc / 陈书 是一个轻量化自托管文档管理平台，面向站长本人或极小私有知识发布流程。

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
CHENDOC_FORCE_HTTPS=true
CHENDOC_TRUST_PROXY=127.0.0.1,::1
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
- R2 运行密钥只需对象读写权限，不应授予桶 CORS 管理权限。CORS 在 Cloudflare 控制台限定为 `PUBLIC_SITE_URL`，方法仅 `GET`、`HEAD`、`PUT`。
- 生产环境默认要求 `CHENDOC_UPLOAD_SCAN_WEBHOOK`。R2 对象备份可选；需要时配置 `CHENDOC_REQUIRE_R2_BACKUP=true` 和独立 `R2_BACKUP_BUCKET`。
- 上线前建议测试登录、公开分享、分享审核、注册卡密、R2 上传和管理员安全中心。

### 更新日志

#### 2.6.2

- 修复收集表编辑器样式变量失效、列表列错位、草稿无效链接和提交记录编号错误。
- 收敛到真实可用题型和操作，补齐保存、发布状态、移动编辑、分节、专属信息与字段校验。
- 公开页加强必填、成功回显和内联 JSON 编码；提交记录统一显示匿名来源摘要。
- 文档编辑器自动收起无内容的左栏，删除文档改放“更多”菜单，避免横向危险按钮误触。

#### 2.6.1

- 修复 MariaDB/旧版 MySQL 不支持 `TEXT DEFAULT ('[]')` 导致收集表迁移失败。
- `forms.fields` 改为无默认值的非空字段，创建表单时仍显式写入 JSON。
- 增加跨 MySQL 变体 DDL 回归测试，并强制 Shell 脚本在发布包中保持 LF。
- 修复宝塔/Nginx 本机反向代理下 HTTPS 请求被误判为 HTTP，登录返回 `HTTPS is required`。

#### 2.6.0

- 修复公开表单 CSP、会话令牌轮换、动态 HTML 输出和表单防滥用。
- 增加文档密钥 keyring、恢复码哈希、危险操作验证和 MySQL 外键校验。
- 增加表单隐私保留、附件清理/扫描、加密备份恢复验证和日志轮换。
- 优化文档筛选、版本预览、分享状态、移动端操作、上传重试和首屏性能预算。

#### 2.5.2

版本号：`2.5.2`

展示版本：`v2.5.2`

本次更新内容：
- 移除公开分享页标题下方的站点名和更新时间。
- 新增分享页专属信息设置，可在正文下方展示类似原生展示广告的自定义联系文案。

更新时间：2026-06-14 12:49:50 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

#### 2.5.1

版本号：`2.5.1`

展示版本：`v2.5.1`

本次更新内容：

- 优化登录页首屏加载，表单先渲染，不再等待站点配置、远程 Logo 或壁纸预加载完成。
- 登录路由守卫跳过无会话访问 `/login` 时的 `fetchMe()`，避免首屏前触发 `/api/auth/me` 和网关 challenge。
- 登录默认壁纸改用 `login-wallpaper.webp`，用 `login-wallpaper-small.webp` 做首屏占位，移除旧登录壁纸资产。

更新时间：2026-06-13 15:16:16 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

#### 2.5.0

版本号：`2.5.0`

展示版本：`v2.5.0`

本次更新内容：

- 架构更新版本，根项目、管理端、服务端、锁文件和系统展示版本已同步到 `2.5.0`。
- 强化 Gateway Packet Layer：动态 `keyId`、挑战绑定、HMAC-SHA256 签名、nonce/timestamp 防重放和加密响应链路。
- 强化登录安全：登录风险跟踪、TOTP 风险挑战、危险操作二次验证、单次恢复码和安全中心管理页。
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

ChenDoc / Chen Shu is a lightweight self-hosted document platform for one owner or a very small private publishing workflow.

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

#### 2.6.2

- Fixed broken form-editor tokens, list alignment, invalid draft links, and submission numbering.
- Kept only working field and action paths; improved saving, publishing state, mobile editing, sections, exclusive info, and validation.
- Hardened required public fields, success summaries, inline JSON encoding, and anonymous source-digest wording.
- Collapsed empty editor sidebars and moved document deletion into the More menu to prevent wide accidental-click targets.

#### 2.6.1

- Fixed form migration on MariaDB and older MySQL variants that reject `TEXT DEFAULT ('[]')`.
- Kept `forms.fields` required without a database default; form creation still writes JSON explicitly.
- Added a cross-variant DDL regression test and forced LF line endings for packaged shell scripts.
- Fixed HTTPS requests being misclassified behind a local BT/Nginx reverse proxy, which blocked login with `HTTPS is required`.

#### 2.6.0

- Hardened form CSP, session rotation, dynamic output, and form abuse controls.
- Added document keyrings, hashed recovery codes, dangerous-operation checks, and MySQL integrity validation.
- Added form retention controls, upload cleanup/scanning, encrypted backup verification, and log rotation.
- Improved document filters, version previews, share states, mobile actions, upload recovery, and initial-load budgets.

#### 2.5.2

- Removed the site name and update time from public share page headers.
- Added configurable share-page exclusive info, rendered below content as a native-style display note.

Updated at: 2026-06-14 12:49:50 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

#### 2.5.1

- Optimized login first paint: the form renders immediately without waiting for site config, remote Logo, or wallpaper preloading.
- Skipped `fetchMe()` for no-session `/login` visits, avoiding `/api/auth/me` and gateway challenge work before first paint.
- Switched the bundled login wallpaper to `login-wallpaper.webp`, used `login-wallpaper-small.webp` as the first-paint placeholder, and removed the old login wallpaper assets.

Updated at: 2026-06-13 15:16:16 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

#### 2.5.0

- Architecture update release. Root, admin, server, lockfile, and displayed version are synchronized to `2.5.0`.
- Hardened Gateway Packet Layer with dynamic `keyId`, challenge binding, HMAC-SHA256 signing, nonce/timestamp replay protection, and encrypted responses.
- Added login risk tracking, TOTP risk challenges, dangerous-operation re-verification, recovery codes, and the admin security center.
- Added AES-256-GCM document encryption at rest and migration scripts for existing documents.
- Improved public share first paint, ETag / Last-Modified caching, password-protected share pages, and share review.
- Updated deployment preflight and `deploy.sh` to require `DATABASE_PROVIDER=mysql` and a `mysql://` `DATABASE_URL`.
- Added security CI, server-side test coverage, log redaction, and unified error handling.

Updated at: 2026-06-13 02:05:23 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)
