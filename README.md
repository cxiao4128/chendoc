# ChenDoc / Chen Shu

当前版本 / Current version: `v1.2.2`

语言 / Language: [中文](#中文) | [English](#english)

## 更新日志 / Changelog

### 中文更新

版本号：`1.2.2`

展示版本：`v1.2.2`

本次更新内容：

- 新增 `DATABASE_PROVIDER=mysql` 运行时连接支持，默认仍保持 SQLite。
- 新增一次性 SQLite 到 MySQL 安全迁移脚本，迁移前自动备份到 `backups/db/`。
- 新增迁移校验：表数量、管理员权限、回收站状态、设置记录、分享标识和分享审核元数据。
- 新增 `docs/sqlite-to-mysql.md`，说明宝塔 MySQL 迁移、切换和回滚流程。

更新时间：2026-05-24 17:48:59 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

#### 早期更新

版本号：`1.2.2`

展示版本：`v1.2.2`

本次更新内容：

- 收紧生产构建的 JS chunk 命名，避免在文件名中暴露认证、请求、编辑器等模块含义。
- 保持登录、会话、请求、加密和编辑器独立拆分，入口 chunk 只保留启动与路由基础代码。
- 优化登录链路的 API 包装和 endpoint 映射，减少生产产物中的明显业务导出名。
- 新增普通用户 `/users` 工作区路由，登录后按角色进入管理员后台或普通用户文档空间。
- 精简登录页首屏加载内容，编辑器继续按需加载。
- 保留单次轻量客户端风险标记，不增加高频检测或重型风控逻辑。

更新时间：2026-05-24 17:48:59 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.1`

本次更新内容：

- 修复分享审核页在动态路由样式未及时加载时出现裸样式的问题，审核页样式现在随后台壳层提前加载。

更新时间：2026-05-24 12:57:43 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.0`

本次更新内容：

- 管理端生产构建新增轻量 JS 混淆与适度分布式拆包。
- 拆分前端加密、响应解密、会话授权和轻量运行时风险标记模块。
- 登录/注册验证码改为计算题样式，加减法控制在 100 以内，乘除法控制在 10×10 范围内。
- 新增 API endpoint 兼容层和 challenge 回退兼容逻辑，保持旧后端可用。
- 更新版本规范，明确 `x.y.z` 语义。

更新时间：2026-05-24 12:25:05 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### English Changelog

Version: `1.2.2`

Display version: `v1.2.2`

Changes in this release:

- Added `DATABASE_PROVIDER=mysql` runtime support while keeping SQLite as the default.
- Added a one-time safe SQLite to MySQL migration script with automatic pre-migration backup in `backups/db/`.
- Added migration validation for table counts, admin role, trash/deleted state, settings, share identifiers, and share review metadata.
- Documented the BT Panel MySQL migration, cutover, and rollback flow in `docs/sqlite-to-mysql.md`.

Updated at: 2026-05-24 17:48:59 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

#### Earlier Updates

Version: `1.2.2`

Display version: `v1.2.2`

Changes in this release:

- Tightened production JS chunk names so module purpose is not exposed through filenames.
- Kept login, session, request, crypto, and editor code in separate chunks while keeping the entry chunk focused on startup and routing.
- Reduced obvious API wrapper and endpoint-map names in production output.
- Added the `/users` workspace routes so sign-in now lands in the admin or user document area based on role.
- Trimmed the login route's initial load path; the editor remains lazy-loaded.
- Kept the runtime risk marker lightweight and single-run, without high-frequency scans or heavy fingerprinting.

Updated at: 2026-05-24 17:48:59 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `1.2.1`

Changes in this release:

- Fixed the share review page rendering with unstyled fallback controls when the route-level CSS chunk is not loaded quickly enough. The review page styles now load with the admin shell.

Updated at: 2026-05-24 12:57:43 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `1.2.0`

Changes in this release:

- Added lightweight production JS obfuscation and moderate distributed chunk splitting for the admin app.
- Split frontend crypto, response decryption, session authorization, and lightweight runtime risk marking into separate modules.
- Replaced the login/register captcha with a math challenge style; addition/subtraction stay within 100, multiplication/division stay within the 10×10 range.
- Added an API endpoint compatibility layer and optional challenge fallback logic while keeping the existing backend compatible.
- Documented the `x.y.z` versioning semantics.

Updated at: 2026-05-24 12:25:05 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

## 中文

[English](#english)

ChenDoc 是一个轻量的私有文档系统，适合个人服务器、小团队或内部知识库使用。它提供文档编辑、公开分享、分享审核、注册卡密、回收站、R2/S3 兼容对象存储、操作日志和后台系统管理。

### 功能

- 文档创建、编辑、搜索、回收站和历史版本。
- 公开分享、访问密码、分享码、自定义短链接和分享审核。
- 注册卡密管理。
- R2/S3 兼容对象存储配置、连接测试和上传测试。
- 后台系统管理：操作日志、站点外观、用户管理、版本号、检查更新和开源链接。
- 管理端登录、注册、验证码和加密会话。

### 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、TipTap。
- 后端：Node.js 20+、Fastify、TypeScript、Drizzle ORM、SQLite / MySQL。
- 存储：SQLite 默认保存业务数据，也可切换到 MySQL；Cloudflare R2 或 S3 兼容对象存储保存上传文件。

### 环境要求

- Node.js 20 或更高版本。
- npm。
- Linux 服务器建议使用 Nginx、宝塔或其他反向代理，将站点代理到 `http://127.0.0.1:8985`。

### 本地开发

```bash
npm install
npm run dev
```

默认前端开发服务运行在 `5175`，后端端口由 `.env` 中的 `PORT` 控制。

### 构建与运行

```bash
npm install
npm run build
npm run db:migrate
npm start
```

### 环境变量

复制模板后填写真实配置：

```bash
cp .env.example .env
```

重点配置：

- `PUBLIC_SITE_URL`：站点公网地址。
- `DATABASE_PROVIDER`：数据库类型，默认 `sqlite`，可选 `mysql`。
- `DATABASE_URL`：SQLite 数据库路径或 MySQL 连接串。
- `JWT_SECRET`：登录会话密钥。
- `CONFIG_ENCRYPTION_KEY`：配置加密密钥。
- `RSA_PRIVATE_KEY_ENCRYPTION_KEY`：RSA 私钥加密密钥。
- `DEFAULT_ADMIN_USERNAME`：初始化管理员用户名。
- `DEFAULT_ADMIN_PASSWORD`：初始化管理员密码。
- `R2_*`：Cloudflare R2 或 S3 兼容存储配置。

不要提交 `.env`。生产环境请使用唯一强密钥和唯一强密码。

### 初始化管理员

管理员账号通过脚本创建：

```bash
npm run admin:init
```

初始化前请在 `.env` 中设置：

```bash
DEFAULT_ADMIN_USERNAME=你的管理员用户名
DEFAULT_ADMIN_PASSWORD=你的管理员强密码
```

README 不展示默认管理员密码。请在 `.env` 中自行设置并妥善保存。

如果管理员账号已经存在，初始化脚本只会确认账号为管理员并处于启用状态，不会重置已有密码。需要主动重置时再执行：

```bash
CHENDOC_RESET_ADMIN_PASSWORD=1 npm run admin:init
```

### 部署

从 GitHub Release 下载部署压缩包后，在部署目录内解压并执行：

```bash
unzip -o chendoc-1.2.2-*.zip
cp .env.example .env
# 编辑 .env，填写生产环境配置
bash ./deploy.sh
```

首次部署并初始化管理员时：

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

部署脚本会检查环境、安装依赖、构建前后端、执行数据库迁移，并通过 PM2 启动服务。

反向代理目标：

```text
http://127.0.0.1:8985
```

### 常用命令

```bash
npm run dev              # 本地开发
npm run build            # 构建前端和后端
npm run test             # 运行后端测试
npm run db:migrate       # 数据库迁移
npm run admin:init       # 初始化或修复管理员账号
npm run r2:import        # 导入 R2 配置
npm run db:backup        # 备份 SQLite 数据库
bash ./deploy.sh         # 部署并重启服务
bash ./start.sh          # 启动已构建服务
bash ./stop.sh           # 停止服务
```

### 目录说明

```text
apps/admin/              Vue 管理后台
server/                  Fastify 后端和数据库模块
scripts/                 构建、部署、备份脚本
data/                    运行数据和 SQLite 数据库，不提交
server/public/admin/     构建后由后端托管的前端产物
```

### 安全提示

- 不要公开 `.env`、数据库、日志和部署密钥。
- 首次部署后请确认管理员密码、JWT 密钥、配置加密密钥和 RSA 私钥加密密钥均已替换。
- R2 Access Key 和 Secret 只保存在服务端配置中，前端不会直接暴露密钥。
- 上线前建议测试公开分享、分享审核、注册卡密和 R2 上传链路。

### 开源地址

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)

## English

[中文](#中文)

ChenDoc is a lightweight private documentation system for personal servers, small teams, and internal knowledge bases. It includes document editing, public sharing, share review, invite codes, trash recovery, R2/S3-compatible object storage, audit logs, and system administration.

### Features

- Create, edit, search, restore, and version documents.
- Public sharing with access passwords, share codes, custom slugs, and review workflow.
- Invite-code management.
- R2/S3-compatible object-storage settings, connection test, and upload test.
- Admin console with audit logs, site appearance, user management, version display, update check, and open-source link.
- Admin login, registration, captcha, and encrypted sessions.

### Tech Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, TipTap.
- Backend: Node.js 20+, Fastify, TypeScript, Drizzle ORM, SQLite / MySQL.
- Storage: SQLite by default, optional MySQL for application data, Cloudflare R2 or S3-compatible object storage for uploaded files.

### Requirements

- Node.js 20 or newer.
- npm.
- A Linux server is recommended for production. Use Nginx, BT Panel, or another reverse proxy to `http://127.0.0.1:8985`.

### Local Development

```bash
npm install
npm run dev
```

The frontend dev server uses port `5175` by default. The backend port is configured through `PORT` in `.env`.

### Build and Run

```bash
npm install
npm run build
npm run db:migrate
npm start
```

### Environment Variables

Copy the example file and fill in your own production values:

```bash
cp .env.example .env
```

Important settings:

- `PUBLIC_SITE_URL`: public site URL.
- `DATABASE_PROVIDER`: database provider, `sqlite` by default, optional `mysql`.
- `DATABASE_URL`: SQLite database path or MySQL connection URL.
- `JWT_SECRET`: session signing secret.
- `CONFIG_ENCRYPTION_KEY`: configuration encryption key.
- `RSA_PRIVATE_KEY_ENCRYPTION_KEY`: RSA private-key encryption key.
- `DEFAULT_ADMIN_USERNAME`: initial admin username.
- `DEFAULT_ADMIN_PASSWORD`: initial admin password.
- `R2_*`: Cloudflare R2 or S3-compatible storage settings.

Do not commit `.env`. Use strong, unique production secrets.

### Initialize Admin

Create the administrator account with:

```bash
npm run admin:init
```

Before running it, set these values in `.env`:

```bash
DEFAULT_ADMIN_USERNAME=your-admin-username
DEFAULT_ADMIN_PASSWORD=your-strong-admin-password
```

The README does not publish a default admin password. Configure it in `.env`.

If the admin account already exists, the script only ensures it is enabled and has admin privileges. To reset the password intentionally, run:

```bash
CHENDOC_RESET_ADMIN_PASSWORD=1 npm run admin:init
```

### Deployment

Download the deployment archive from GitHub Releases, extract it inside your deployment directory, and run:

```bash
unzip -o chendoc-1.2.2-*.zip
cp .env.example .env
# Edit .env for production settings.
bash ./deploy.sh
```

For the first deployment with admin initialization:

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

The deployment script checks the environment, installs dependencies, builds the frontend and backend, runs database migrations, and starts the service through PM2.

Reverse proxy target:

```text
http://127.0.0.1:8985
```

### Common Commands

```bash
npm run dev              # Local development
npm run build            # Build frontend and backend
npm run test             # Run backend tests
npm run db:migrate       # Run database migrations
npm run admin:init       # Initialize or repair admin account
npm run r2:import        # Import R2 settings
npm run db:backup        # Backup SQLite database
bash ./deploy.sh         # Deploy and restart service
bash ./start.sh          # Start built service
bash ./stop.sh           # Stop service
```

### Project Layout

```text
apps/admin/              Vue admin app
server/                  Fastify backend and database modules
scripts/                 Build, deployment, and backup scripts
data/                    Runtime data and SQLite database, not committed
server/public/admin/     Built frontend served by backend
```

### Security Notes

- Do not publish `.env`, databases, logs, or deployment secrets.
- After the first deployment, confirm that the admin password, JWT secret, config encryption key, and RSA private-key encryption key have all been replaced.
- R2 access keys are stored only on the server side and are not exposed directly to the frontend.
- Before going live, test public sharing, share review, invite codes, and R2 upload behavior.

### Open Source

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)
