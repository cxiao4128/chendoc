# ChenDoc / Chen Shu

当前版本 / Current version: `v2.5.0`

语言 / Language: [中文](#中文) | [English](#english)

## 更新日志 / Changelog

### 中文更新

版本号：`2.5.0`

展示版本：`v2.5.0`

本次更新内容�?
- Architecture update release; version synchronized to 2.5.0.
Updated at: 2026-06-13 02:05:23 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

#### 早期更新

版本号：`2.3.0`

展示版本：`v2.3.0`

本次更新内容�?
- 按定�?PNG 落地 ChenDoc 浅紫�?UI：登录页、文档工作台、回收站、分享审核和系统管理统一使用�?logo、登录壁纸、卡片、表格和右侧信息栏�?- 登录页换用定版动漫壁纸与半透明登录面板，验证码继续保持风险触发，不默认展示�?- 后台工作区补齐顶部搜�?快捷入口、横�?ChenDoc wordmark、淡紫选中导航、用户头像和独立退出入口�?- 文档、回收站、审核和系统管理页面对齐定版图的信息密度，保留原有文档、回收站、审核、R2、卡密、日志、外观和用户管理链路�?- 继续保持轻量实现，不引入新的大型 UI 框架、远程字体或额外运行时依赖�?
更新时间�?026-06-07 02:30:00 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`2.2.0`

展示版本：`v2.2.0`

本次更新内容�?
- 建立 ChenDoc 商业化文档系统设计语言：专业蓝、发布绿、平台浅灰背景�?px 控件和清晰状态系统贯穿登录、后台、编辑器与分享页�?- 登录页重构为 ChenDoc 产品入口：保留二次元壁纸和品牌角色，但角色退为品牌资产，主体只服务登录�?- Logo 系统继续服务“陈�?/ ChenDoc”品牌识别，副标题统一为文档管理平台�?- 文档页从后台列表重构为现代文档平台，保留文档状态、分享路径和审核状态概览�?- 编辑器作为核心竞争力重构：专业白色创作画布、轻量工具栏、自动保存、目录、分享和历史版本形成成熟文档平台体验�?- 分享页改为阅读优先的品牌页面：公开文章、密码访问页和不可用页统一使用 ChenDoc 阅读系统�?- 控制中心替代后台设置语义，品牌、账号、日志、存储、发布审核和版本信息使用统一产品控制台关系�?- 继续复用本地字体和现有轻�?CSS，不引入大型动画库、大�?UI 库或外链字体资源�?
更新时间�?026-06-05 00:00:00 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`2.1.0`

展示版本：`v2.1.0`

本次更新内容�?
- Gateway Packet Layer 升级�?v2.1.0，`data` 不再�?`base64(JSON)`，而是外层 AES-GCM 加密后的二进制封套�?- 请求采用双层加密：业�?body �?AES-GCM 加密，再把包�?`key/keyId/iv/challenge/timestamp/nonce/action/body` �?packet 整体二次加密�?- 生产请求体仍只允�?`{ "data": "..." }`，解�?`data` 不会直接看到 `v/keyId/key/iv/challenge/nonce/action/body`�?- 生产 API 统一通过 `/api/gateway` 进入后端，网关中间件集中完成外层解密、时间戳校验、nonce 防重放、内�?body 解密和动作码分发�?- 新增动作码路由，使用 `a1/a2/a3/d1/d2/d3/r1/r2/r3/s1/s2` 等代码替代可读业务路由�?- 生产响应也统一返回 `{ "data": "..." }`，响应内容使�?AES-GCM 加密，不返回�?JSON 业务数据�?- 开发模式可�?`VITE_DISABLE_GATEWAY_PACKET=true` 临时关闭网关封包；生产默认启用�?- 生产日志只保�?`requestId/actionCode/status/errorCode/duration` 等低敏字段，不记录解�?body、密钥、token、sessionKey、password、challenge �?Authorization�?- 保持 MySQL、R2 上传、公开分享、回收站和用户权限链路不变，部署命令仍为 `bash ./deploy.sh`�?
更新时间�?026-05-28 13:02:20 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.3.0`

展示版本：`v1.3.0`

本次更新内容�?
- 优化登录页首屏加载，关键样式�?HTML 提前加载，减少裸样式闪烁�?- 优化登录页壁纸与 Logo 预加载，先显�?small 图，再无感切换高清图�?- 修复公开分享页品�?Logo 显示，未配置时使用本地默�?Logo�?- 移除公开分享页多余的“公开分享”标识，头部只保�?Logo 和站点名�?- 优化禁用、注销用户的登录反馈，失败状态会明确提示�?- 优化登录成功反馈和角色跳转，管理员进�?`/admin/docs`，普通用户进�?`/users/docs`�?- 统一生产请求加密结构，业务请求体外层只保�?`data`�?- 移除系统设置页重复的回收站入口，左侧导航栏回收站继续保留�?- 保持 MySQL 运行模式和轻量查询策略，继续适配 2H4G 宝塔服务器�?
更新时间�?026-05-27 19:30:33 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.4`

展示版本：`v1.2.4`

本次更新内容�?
- `bash ./deploy.sh` 会在构建前自动执�?`npm run db:backup` �?`npm run db:migrate`，确保部署前有数据库备份且表结构已同步�?- `npm run db:migrate` 仍保留为手动运维命令，用于单独处理建表或结构更新�?- MySQL 连接新增 10 秒连接超时，数据库地址或端口不通时会更快失败�?- 部署脚本会明确输出数据库备份、迁移和管理员初始化的状态�?- 部署预检会明确拦截根目录 `.env` 中遗留的 SQLite `DATABASE_URL`，提示改�?MySQL 连接串�?
更新时间�?026-05-25 21:06:20 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.3`

展示版本：`v1.2.3`

本次更新内容�?
- 登录页壁纸改为静�?small WebP 首屏占位，高�?WebP �?HTML �?preload 后再切换�?- MySQL 成为生产唯一运行数据库，SQLite 仅保留历史迁移和测试说明�?- 文档列表和回收站列表改为分页读取，只返回列表必要字段，不再返回正文内容�?- MySQL 连接池、站点设置读取、用户管理列表和常用索引做轻量化优化，改�?2H4G 宝塔服务器体验�?- 回收站新增批量恢复和批量永久删除，服务端按用户权限校验�?- 新增 300ms 以上慢接口日志，只记�?method、path、duration �?queryName�?
更新时间�?026-05-25 00:56:50 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.2`

展示版本：`v1.2.2`

本次更新内容�?

- 收紧生产构建�?JS chunk 命名，避免在文件名中暴露认证、请求、编辑器等模块含义�?
- 保持登录、会话、请求、加密和编辑器独立拆分，入口 chunk 只保留启动与路由基础代码�?
- 优化登录链路�?API 包装�?endpoint 映射，减少生产产物中的明显业务导出名�?
- 新增普通用�?`/users` 工作区路由，登录后按角色进入管理员后台或普通用户文档空间�?
- 精简登录页首屏加载内容，编辑器继续按需加载�?
- 保留单次轻量客户端风险标记，不增加高频检测或重型风控逻辑�?

更新时间�?026-05-24 17:48:59 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.1`

本次更新内容�?

- 修复分享审核页在动态路由样式未及时加载时出现裸样式的问题，审核页样式现在随后台壳层提前加载�?

更新时间�?026-05-24 12:57:43 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

版本号：`1.2.0`

本次更新内容�?

- 管理端生产构建新增轻�?JS 混淆与适度分布式拆包�?
- 拆分前端加密、响应解密、会话授权和轻量运行时风险标记模块�?
- 登录/注册验证码改为计算题样式，加减法控制�?100 以内，乘除法控制�?10×10 范围内�?
- 新增 API endpoint 兼容层和 challenge 回退兼容逻辑，保持旧后端可用�?
- 更新版本规范，明�?`x.y.z` 语义�?

更新时间�?026-05-24 12:25:05 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### English Changelog

Version: `2.5.0`

Display version: `v2.5.0`

Changes in this release:

- Architecture update release. Synchronized the root, admin, server, lockfile, and displayed system version to 2.5.0.

Updated at: 2026-06-13 02:05:23 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

#### Earlier Updates

Version: `2.3.0`

Display version: `v2.3.0`

Changes in this release:

- Implemented the finalized light lavender ChenDoc UI from the supplied PNG references across login, document workspace, trash, share review, and system management.
- Replaced bundled logo and login wallpaper assets while keeping captcha adaptive, so it does not show by default.
- Updated the admin shell with the new wordmark treatment, top search/actions, profile entry, and soft lavender active navigation.
- Reworked the target pages around the finalized card, table, side-panel, and status-density direction while preserving existing document, trash, review, R2, invite, log, appearance, and user-management flows.
- Kept the implementation lightweight, without adding a new UI framework, remote fonts, or additional runtime dependencies.

Updated at: 2026-06-07 02:30:00 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `2.2.0`

Display version: `v2.2.0`

Changes in this release:

- Established ChenDoc's "light paper study" design language: warm paper surfaces, ink text, amber annotations, book-spine lines, and subtle cool highlights across login, workspace, editor, and share pages.
- Rebuilt the login page as the Chen Shu home entrance, preserving the full-screen wallpaper and character as the visual center instead of using a split-screen login template.
- Reworked the logo system so the Chinese brand name is primary and the round mark is supporting, strengthening the brand title, subtitle, and entry point.
- Rebuilt the document page as a private bookshelf with paper-index rows, unified empty states, trash, and share-review surfaces.
- Reworked the editor as the core writing space with a centered paper canvas, book-spine accent, light manuscript grid, quieter toolbar, and more comfortable Chinese reading rhythm.
- Reworked public share pages into a reading product with consistent ChenDoc article, password, and unavailable layouts.
- Renamed and reorganized settings into a control center for brand scene, accounts, logs, storage, and version state.
- Kept the implementation lightweight by reusing local fonts and CSS without adding large animation libraries, UI frameworks, or external font packages.

Updated at: 2026-06-05 00:00:00 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

#### Earlier Updates

Version: `2.1.0`

Display version: `v2.1.0`

Changes in this release:

- Upgraded Gateway Packet Layer to v2.1.0. `data` is no longer `base64(JSON)`; it is an AES-GCM encrypted binary envelope.
- Requests now use double-layer encryption: the business body is encrypted first, then the whole packet containing `key/keyId/iv/challenge/timestamp/nonce/action/body` is encrypted again.
- Production request bodies still allow only `{ "data": "..." }`; decoding `data` no longer reveals packet JSON or gateway fields.
- Production API traffic is routed through `/api/gateway`, where middleware centralizes outer decrypt, timestamp validation, replay protection, inner body decrypt, action-code resolution, and dispatch.
- Added action-code routing such as `a1/a2/a3/d1/d2/d3/r1/r2/r3/s1/s2` instead of readable business route names.
- Production responses also return `{ "data": "..." }` with AES-GCM encrypted response envelopes, not raw business JSON.
- Development can temporarily disable packet mode with `VITE_DISABLE_GATEWAY_PACKET=true`; production enables it by default.
- Production logging keeps only low-sensitive fields such as `requestId/actionCode/status/errorCode/duration`.
- Kept MySQL, R2 uploads, public share pages, recycle bin flows, permissions, and `bash ./deploy.sh` deployment unchanged.

Updated at: 2026-05-28 13:02:20 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `1.3.0`

Display version: `v1.3.0`

Changes in this release:

- Optimized the login first paint by loading critical login styles from the HTML entry.
- Optimized wallpaper and Logo preloading with a small placeholder image before the full wallpaper swap.
- Fixed the public share header to use the site Logo with a bundled fallback.
- Removed the extra “公开分享�?marker from the public share page header.
- Improved login feedback for disabled and deleted users.
- Added immediate success feedback and faster role-based redirects after sign-in.
- Unified production request encryption so encrypted business requests expose only `data` at the body root.
- Removed the duplicate Trash card from System Settings while keeping the sidebar Trash entry.
- Kept the MySQL runtime path and lightweight query strategy for 2C4G BT Panel servers.

Updated at: 2026-05-27 19:30:33 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `1.2.4`

Display version: `v1.2.4`

Changes in this release:

- `bash ./deploy.sh` now runs `npm run db:backup` and `npm run db:migrate` before building, so deployment has a database backup and synchronized schema.
- Database migration remains available as a manual command when tables need to be created or updated.
- Added a 10-second MySQL connection timeout so unreachable database hosts or ports fail faster.
- Deployment now prints explicit status for skipped database migration and admin initialization.
- Deploy preflight now clearly blocks legacy SQLite `DATABASE_URL` values in the root `.env` and asks for a MySQL URL.

Updated at: 2026-05-25 21:06:20 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

Version: `1.2.3`

Display version: `v1.2.3`

Changes in this release:

- Changed the login wallpaper to a static small WebP placeholder with a preloaded full WebP swap.
- Made MySQL the only production runtime database; SQLite remains only for historical migration and test notes.
- Paginated document and trash lists so list APIs return only lightweight fields, not document body content.
- Tuned the MySQL pool, site settings reads, user list loading, and common indexes for low-resource BT Panel servers.
- Added batch restore and batch permanent delete in Trash with server-side ownership checks.
- Added lightweight slow-request logging above 300ms with method, path, duration, and queryName only.

Updated at: 2026-05-25 00:56:50 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

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

ChenDoc 是一个轻量化商业文档管理系统，适合自托管服务器、小团队或内部资料站使用。它提供文档编辑、公开分享、分享审核、注册卡密、回收站、R2/S3 兼容对象存储、操作日志和产品控制中心�?
### 功能

- 文档创建、编辑、搜索、回收站和历史版本�?
- 公开分享、访问密码、管理员短码、普通用户七位分享码和分享审核�?- 注册卡密管理�?
- R2/S3 兼容对象存储配置、连接测试和上传测试�?
- 产品控制中心：操作日志、品牌资产、用户管理、版本号、检查更新和开源链接�?- 管理端登录、注册、验证码和加密会话�?

### 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、TipTap�?
- 后端：Node.js 20+、Fastify、TypeScript、Drizzle ORM、MySQL�?- 存储：MySQL 保存业务数据；历�?SQLite 文件仅作为迁移来源保留，Cloudflare R2 �?S3 兼容对象存储保存上传文件�?
### 环境要求

- Node.js 20 或更高版本�?
- npm�?
- Linux 服务器建议使�?Nginx、宝塔或其他反向代理，将站点代理�?`http://127.0.0.1:8985`�?

### 本地开�?

```bash
npm install
npm run dev
```

默认前端开发服务运行在 `5175`，后端端口由 `.env` 中的 `PORT` 控制�?

### 构建与运�?

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

重点配置�?

- `PUBLIC_SITE_URL`：站点公网地址�?
- `DATABASE_PROVIDER`：生产运行固定使�?`mysql`�?- `DATABASE_URL`：MySQL 连接串，例如 `mysql://user:password@127.0.0.1:3306/chendoc`�?- `JWT_SECRET`：登录会话密钥�?
- `CONFIG_ENCRYPTION_KEY`：配置加密密钥�?
- `RSA_PRIVATE_KEY_ENCRYPTION_KEY`：RSA 私钥加密密钥�?
- `DEFAULT_ADMIN_USERNAME`：初始化管理员用户名�?
- `DEFAULT_ADMIN_PASSWORD`：初始化管理员密码�?
- `R2_*`：Cloudflare R2 �?S3 兼容存储配置�?

不要提交 `.env`。生产环境请使用唯一强密钥和唯一强密码�?

### 初始化管理员

管理员账号通过脚本创建�?

```bash
npm run admin:init
```

初始化前请在 `.env` 中设置：

```bash
DEFAULT_ADMIN_USERNAME=你的管理员用户名
DEFAULT_ADMIN_PASSWORD=你的管理员强密码
```

README 不展示默认管理员密码。请�?`.env` 中自行设置并妥善保存�?

如果管理员账号已经存在，初始化脚本只会确认账号为管理员并处于启用状态，不会重置已有密码。需要主动重置时再执行：

```bash
CHENDOC_RESET_ADMIN_PASSWORD=1 npm run admin:init
```

### 部署

�?GitHub Release 下载部署压缩包后，在部署目录内解压并执行�?

```bash
unzip -o chendoc-2.5.0-*.zip
cp .env.example .env
# 编辑 .env，填写生产环境配�?
bash ./deploy.sh
```

首次部署并初始化管理员时�?

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

部署脚本会检查环境、安装依赖、执行安全审计、备份数据库、运行迁移、构建前后端，并通过 PM2 启动服务。需要单独维护表结构时，仍可手动运行 `npm run db:migrate`�?
反向代理目标�?
```text
http://127.0.0.1:8985
```

如在宝塔/Nginx 中额外配置静态缓存，可给 `/site-assets/` 图片设置长缓存，例如�?
```nginx
location /site-assets/ {
  proxy_pass http://127.0.0.1:8985;
  expires 30d;
  add_header Cache-Control "public, max-age=2592000, immutable";
}
```

### 常用命令

```bash
npm run dev              # 本地开�?
npm run build            # 构建前端和后�?
npm run test             # 运行后端测试
npm run db:migrate       # 数据库迁�?
npm run admin:init       # 初始化或修复管理员账�?
npm run r2:import        # 导入 R2 配置
npm run db:backup        # 部署前数据库备份；MySQL 使用 mysqldump，SQLite 使用 VACUUM INTO
bash ./deploy.sh         # 部署并重启服�?bash ./start.sh          # 启动已构建服�?
bash ./stop.sh           # 停止服务
```

### 目录说明

```text
apps/admin/              Vue 管理后台
server/                  Fastify 后端和数据库模块
scripts/                 构建、部署、备份脚�?
data/                    历史迁移数据和本地运行文件，不提�?server/public/admin/     构建后由后端托管的前端产�?
```

### 安全提示

- 不要公开 `.env`、数据库、日志和部署密钥�?
- 首次部署后请确认管理员密码、JWT 密钥、配置加密密钥和 RSA 私钥加密密钥均已替换�?
- R2 Access Key �?Secret 只保存在服务端配置中，前端不会直接暴露密钥�?
- 上线前建议测试公开分享、分享审核、注册卡密和 R2 上传链路�?

### 开源地址

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)

## English

[中文](#中文)

ChenDoc is a lightweight commercial document management and knowledge publishing platform for self-hosted servers, small teams, and internal knowledge bases. It includes document editing, public sharing, share review, invite codes, trash recovery, R2/S3-compatible object storage, audit logs, and system administration.

### Features

- Create, edit, search, restore, and version documents.
- Public sharing with access passwords, admin short codes, seven-digit user share codes, and review workflow.
- Invite-code management.
- R2/S3-compatible object-storage settings, connection test, and upload test.
- Admin console with audit logs, site appearance, user management, version display, update check, and open-source link.
- Admin login, registration, captcha, and encrypted sessions.

### Tech Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, TipTap.
- Backend: Node.js 20+, Fastify, TypeScript, Drizzle ORM, MySQL.
- Storage: MySQL stores application data; historical SQLite files are kept only as migration sources. Cloudflare R2 or S3-compatible object storage stores uploads.

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
- `DATABASE_PROVIDER`: production runtime database provider, fixed to `mysql`.
- `DATABASE_URL`: MySQL connection URL, for example `mysql://user:password@127.0.0.1:3306/chendoc`.
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
unzip -o chendoc-2.5.0-*.zip
cp .env.example .env
# Edit .env for production settings.
bash ./deploy.sh
```

For the first deployment with admin initialization:

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

The deployment script checks the environment, installs dependencies, runs security audit, backs up the database, runs migrations, builds the frontend and backend, and starts the service through PM2. You can still run `npm run db:migrate` manually for standalone schema maintenance.

Reverse proxy target:

```text
http://127.0.0.1:8985
```

For an extra BT Panel/Nginx static cache rule, `/site-assets/` images can be cached for a long time:

```nginx
location /site-assets/ {
  proxy_pass http://127.0.0.1:8985;
  expires 30d;
  add_header Cache-Control "public, max-age=2592000, immutable";
}
```

### Common Commands

```bash
npm run dev              # Local development
npm run build            # Build frontend and backend
npm run test             # Run backend tests
npm run db:migrate       # Run database migrations
npm run admin:init       # Initialize or repair admin account
npm run r2:import        # Import R2 settings
npm run db:backup        # Pre-deploy database backup; MySQL uses mysqldump, SQLite uses VACUUM INTO
bash ./deploy.sh         # Deploy and restart service
bash ./start.sh          # Start built service
bash ./stop.sh           # Stop service
```

### Project Layout

```text
apps/admin/              Vue admin app
server/                  Fastify backend and database modules
scripts/                 Build, deployment, and backup scripts
data/                    Historical migration data and local runtime files, not committed
server/public/admin/     Built frontend served by backend
```

### Security Notes

- Do not publish `.env`, databases, logs, or deployment secrets.
- After the first deployment, confirm that the admin password, JWT secret, config encryption key, and RSA private-key encryption key have all been replaced.
- R2 access keys are stored only on the server side and are not exposed directly to the frontend.
- Before going live, test public sharing, share review, invite codes, and R2 upload behavior.

### Open Source

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)
