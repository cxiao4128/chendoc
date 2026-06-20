# 更新日志 / Changelog

语言 / Language: [中文](#中文) | [English](#english)

## 中文

### 2.6.0

版本号：`2.6.0`

展示版本：`v2.6.0`

本次更新内容：

- 修复公开表单 CSP、会话续期轮换、DOM 输出编码和表单容量/重复/验证码控制。
- 增加文档密钥 keyring 与轮换预检、TOTP 恢复码哈希和管理员危险操作验证。
- 增加表单隐私保留、匿名来源摘要、附件生命周期/扫描、MySQL 外键与 CI 校验。
- 增加加密备份、异地复制、恢复验证、日志保留与轮换。
- 终检补齐 SQLite→MySQL 表单字段迁移和级联契约，收紧全部私有 API 的 Gateway 强制检查，并修复必填同意框与批量删除事务。
- 优化文档筛选、真实动态、知识目录、自定义模板、历史版本预览/副本恢复和分享状态说明。
- 优化移动表单/提交记录/编辑器、上传失败恢复、视觉一致性、响应式图片和首屏构建预算。

更新时间：2026-06-20 +08:00

### 2.5.2

版本号：`2.5.2`

展示版本：`v2.5.2`

本次更新内容：
- 移除公开分享页标题下方的站点名和更新时间。
- 新增分享页专属信息设置，可在正文下方展示类似原生展示广告的自定义联系文案。

更新时间：2026-06-14 12:49:50 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 2.5.1

版本号：`2.5.1`

展示版本：`v2.5.1`

本次更新内容：

- 优化登录页首屏加载，表单先渲染，不再等待站点配置、远程 Logo 或壁纸预加载完成。
- 登录路由守卫跳过无会话访问 `/login` 时的 `fetchMe()`，避免首屏前触发 `/api/auth/me` 和网关 challenge。
- 登录默认壁纸改用 `login-wallpaper.webp`，用 `login-wallpaper-small.webp` 做首屏占位，移除旧登录壁纸资产。

更新时间：2026-06-13 15:16:16 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 2.5.0

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

### 2.3.0

版本号：`2.3.0`

展示版本：`v2.3.0`

本次更新内容：

- 按定版 PNG 落地 ChenDoc 浅紫 UI，统一登录页、文档工作台、回收站、分享审核和系统管理视觉。
- 登录页换用定版壁纸与半透明登录面板。
- 后台补齐顶部搜索、快捷入口、横版 ChenDoc wordmark、淡紫选中导航、用户头像和独立退出入口。

### 2.2.0

版本号：`2.2.0`

展示版本：`v2.2.0`

本次更新内容：

- 建立 ChenDoc 文档系统设计语言。
- 登录、后台、编辑器、分享页和控制中心统一到更成熟的文档平台体验。
- 保持轻量 Vue / CSS 实现，不引入大型 UI 框架或外链字体资源。

### 2.0.0

版本号：`2.0.0`

展示版本：`v2.0.0`

本次更新内容：

- 新增 Gateway Packet Layer，生产 API 统一通过 `/api/gateway` 进入后端。
- 生产请求体外层统一收敛为 `{ "data": "..." }`，不再在根层暴露 `key`、`keyId`、`payload`、`challenge` 或业务字段。
- 请求 packet 内部保留 `v`、`key`、`keyId`、`iv`、`challenge`、`timestamp`、`nonce` 和加密后的业务 body。
- 全局 gateway middleware 统一完成 packet decode、RSA-OAEP 解密 AES key、AES-GCM 解密 body，并把解包后的业务 body 注入到 `request.body`。
- controller 不再直接处理业务请求 decrypt，登录、注册、当前用户、改密等认证逻辑统一消费解包后的请求体。
- 生产响应统一封包为 `{ "data": "..." }`，响应 packet 内包含 `code`、`message`、`data`、`timestamp` 和 `requestId`。
- 新增 nonce/timestamp 防重放，timestamp 允许 300 秒偏移，nonce 内存 TTL 为 5 分钟，重复 nonce 返回 `INVALID_NONCE`。
- challenge layer 改为服务端内存维护，前端只保留内存缓存，不写入 localStorage，challenge 进入 packet 内部。
- 前端新增统一 gateway client，统一处理生产 API 的封包、发送、重试入口和响应解包。
- 保持 MySQL、R2 上传、分享页、回收站、用户权限和部署命令不变，继续适配 2H4G 宝塔服务器。

更新时间：2026-05-27 20:02:11 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.3.0

版本号：`1.3.0`

展示版本：`v1.3.0`

本次更新内容：

- 优化登录页首屏加载，关键样式随 HTML 提前加载，减少裸样式闪烁。
- 优化登录页壁纸加载，统一使用定版 PNG。
- 修复公开分享页品牌 Logo 显示，未配置时使用本地默认 Logo。
- 移除公开分享页多余的“公开分享”标识，头部只保留 Logo 和站点名。
- 优化禁用、注销用户的登录反馈，失败状态会明确提示。
- 优化登录成功反馈和角色跳转，管理员进入 `/admin/docs`，普通用户进入 `/users/docs`。
- 统一生产请求加密结构，业务请求体外层只保留 `data`。
- 移除系统设置页重复的回收站入口，左侧导航栏回收站继续保留。
- 保持 MySQL 运行模式和轻量查询策略，继续适配 2H4G 宝塔服务器。

更新时间：2026-05-27 19:30:33 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.2.4

版本号：`1.2.4`

展示版本：`v1.2.4`

本次更新内容：

- `bash ./deploy.sh` 不再自动执行 `npm run db:migrate`，已迁移好的服务器部署时只构建并重启服务。
- 数据库迁移保留为手动命令，需要建表或更新表结构时再单独执行 `npm run db:migrate`。
- MySQL 连接新增 10 秒连接超时，数据库地址或端口不通时会更快失败。
- 部署脚本会明确输出跳过数据库迁移和管理员初始化的状态。
- 部署预检会明确拦截根目录 `.env` 中遗留的 SQLite `DATABASE_URL`，提示改为 MySQL 连接串。

更新时间：2026-05-25 21:06:20 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.2.3

版本号：`1.2.3`

展示版本：`v1.2.3`

本次更新内容：

- 登录页壁纸改为定版 PNG，首屏直接使用同一背景。
- MySQL 作为生产唯一运行数据库，SQLite 仅保留历史迁移和测试说明。
- 文档列表和回收站列表改为分页轻量查询，不再返回正文内容。
- 优化 MySQL 连接池、站点设置读取、用户列表加载和常用索引，降低 2H4G 服务器压力。
- 回收站新增批量恢复和批量永久删除，服务端按用户权限校验。
- 新增 300ms 以上慢接口日志，便于定位卡顿接口。

更新时间：2026-05-25 00:56:50 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.2.2

版本号：`1.2.2`

展示版本：`v1.2.2`

本次更新内容：

- 收紧生产构建的 JS chunk 命名，文件名不再直接暴露认证、请求、编辑器等模块含义。
- 保持登录、会话、请求、加密和编辑器独立拆分，入口 chunk 继续轻量化。
- 优化登录链路的 API 包装和 endpoint 映射，减少生产产物中的明显业务导出名。
- 新增普通用户 `/users` 工作区路由，登录后按角色进入管理员后台或普通用户文档空间。
- 精简登录页首屏加载内容，编辑器仍按需加载。
- 保留单次轻量客户端风险标记，不增加高频检测或重型风控逻辑。

更新时间：2026-05-24 17:48:59 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.2.1

版本号：`1.2.1`

本次更新内容：

- 修复分享审核页在动态路由样式未及时加载时出现裸样式的问题，审核页样式现在随后台壳层提前加载。

更新时间：2026-05-24 12:57:43 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.2.0

版本号：`1.2.0`

本次更新内容：

- 管理端生产构建新增轻量 JS 混淆与适度分布式拆包。
- 拆分前端加密、响应解密、会话授权和轻量运行时风险标记模块。
- 登录/注册验证码改为计算题样式，加减法控制在 100 以内，乘除法控制在 10×10 范围内。
- 新增 API endpoint 兼容层和 challenge 回退兼容逻辑，保持旧后端可用。
- 更新版本规范，明确 `x.y.z` 语义。

更新时间：2026-05-24 12:25:05 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

### 1.0.5

版本号：`1.0.5`

本次更新内容：

- 新增文档批量删除。
- 操作日志不再统计更新分享。
- 用户管理区分超级管理员、管理员和普通用户。
- 提级只能由超级管理员提为管理员。

更新时间：2026-05-10 22:17:48 +08:00

文档官网：[https://d.w92.pw/](https://d.w92.pw/)

## English

### 2.6.0

Version: `2.6.0`

Display version: `v2.6.0`

Changes:

- Fixed public-form CSP, session renewal rotation, DOM output encoding, and form abuse controls.
- Added document keyrings and preflight checks, hashed TOTP recovery codes, and dangerous-operation verification.
- Added form privacy retention, anonymous source digests, upload lifecycle/scanning, MySQL FKs, and CI validation.
- Added encrypted backups, offsite copies, restore verification, and log retention/rotation.
- Improved document filters, activity, knowledge discovery, custom templates, version previews/copy restore, and share-state guidance.
- Improved mobile forms/submissions/editor actions, upload recovery, visual consistency, responsive images, and initial-load budgets.

Updated at: 2026-06-20 +08:00

### 2.5.2

Version: `2.5.2`

Display version: `v2.5.2`

Changes:
- Removed the site name and update time from public share page headers.
- Added configurable share-page exclusive info, rendered below content as a native-style display note.

Updated at: 2026-06-14 12:49:50 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 2.5.1

Version: `2.5.1`

Display version: `v2.5.1`

Changes:

- Optimized login first paint: the form renders immediately without waiting for site config, remote Logo, or wallpaper preloading.
- Skipped `fetchMe()` for no-session `/login` visits, avoiding `/api/auth/me` and gateway challenge work before first paint.
- Switched the bundled login wallpaper to `login-wallpaper.webp`, used `login-wallpaper-small.webp` as the first-paint placeholder, and removed the old login wallpaper assets.

Updated at: 2026-06-13 15:16:16 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 2.5.0

Version: `2.5.0`

Display version: `v2.5.0`

Changes:

- Architecture update release. Root, admin, server, lockfile, and displayed version are synchronized to `2.5.0`.
- Hardened Gateway Packet Layer with dynamic `keyId`, challenge binding, HMAC-SHA256 signing, nonce/timestamp replay protection, and encrypted responses.
- Added login risk tracking, TOTP, dangerous-operation re-verification, recovery codes, and the admin security center.
- Added AES-256-GCM document encryption at rest and migration scripts for existing documents.
- Improved public share first paint, ETag / Last-Modified caching, password-protected share pages, and share review.
- Updated deployment preflight and `deploy.sh` to require `DATABASE_PROVIDER=mysql` and a `mysql://` `DATABASE_URL`.
- Added security CI, server-side test coverage, log redaction, and unified error handling.

Updated at: 2026-06-13 02:05:23 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 2.3.0

Version: `2.3.0`

Display version: `v2.3.0`

Changes:

- Implemented the finalized ChenDoc light-purple UI from PNG references across login, document workspace, trash, share review, and system management.
- Switched login to the finalized wallpaper and translucent login panel.
- Added top search, quick actions, horizontal ChenDoc wordmark, selected navigation styling, user avatar, and a separate logout entry.

### 2.2.0

Version: `2.2.0`

Display version: `v2.2.0`

Changes:

- Established the ChenDoc document-system design language.
- Unified login, admin, editor, share page, and control center into a more mature document platform experience.
- Kept the implementation lightweight with Vue / CSS and no large UI framework or external font dependency.

### 2.0.0

Version: `2.0.0`

Display version: `v2.0.0`

Changes in this release:

- Added the Gateway Packet Layer and routed production API traffic through `/api/gateway`.
- Reduced production request bodies to `{ "data": "..." }`; `key`, `keyId`, `payload`, `challenge`, and business fields are no longer exposed at the root.
- Packet internals now carry `v`, `key`, `keyId`, `iv`, `challenge`, `timestamp`, `nonce`, and the encrypted business body.
- Added global gateway middleware for packet decode, RSA-OAEP AES key decrypt, AES-GCM body decrypt, and `request.body` injection.
- Removed direct business request decrypt handling from controllers.
- Packetized production responses as `{ "data": "..." }` with `code`, `message`, `data`, `timestamp`, and `requestId` inside the response packet.
- Added nonce/timestamp replay protection with a 300-second timestamp window and a 5-minute in-memory nonce TTL. Replays return `INVALID_NONCE`.
- Moved challenge usage inside the packet and kept challenge state in memory instead of localStorage.
- Added a unified admin gateway client for production API packing, transport, retry entry, and response unpacking.
- Kept MySQL, R2 uploads, public share pages, recycle bin flows, permissions, and `bash ./deploy.sh` deployment unchanged.

Updated at: 2026-05-27 20:02:11 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.3.0

Version: `1.3.0`

Display version: `v1.3.0`

Changes in this release:

- Optimized the login first paint by loading critical login styles from the HTML entry.
- Optimized login wallpaper loading with the finalized PNG asset.
- Fixed the public share header to use the site Logo with a bundled fallback.
- Removed the extra “公开分享” marker from the public share page header.
- Improved login feedback for disabled and deleted users.
- Added immediate success feedback and faster role-based redirects after sign-in.
- Unified production request encryption so encrypted business requests expose only `data` at the body root.
- Removed the duplicate Trash card from System Settings while keeping the sidebar Trash entry.
- Kept the MySQL runtime path and lightweight query strategy for 2C4G BT Panel servers.

Updated at: 2026-05-27 19:30:33 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.2.4

Version: `1.2.4`

Display version: `v1.2.4`

Changes in this release:

- `bash ./deploy.sh` no longer runs `npm run db:migrate` automatically; already-migrated servers only build and restart during deployment.
- Database migration remains available as a manual command when tables need to be created or updated.
- Added a 10-second MySQL connection timeout so unreachable database hosts or ports fail faster.
- Deployment now prints explicit status for skipped database migration and admin initialization.
- Deploy preflight now clearly blocks legacy SQLite `DATABASE_URL` values in the root `.env` and asks for a MySQL URL.

Updated at: 2026-05-25 21:06:20 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.2.3

Version: `1.2.3`

Display version: `v1.2.3`

Changes in this release:

- Switched the login wallpaper to the finalized PNG asset.
- Made MySQL the only production runtime database; SQLite remains only for historical migration and tests.
- Paginated document and trash list queries and stopped returning body content from list APIs.
- Tuned the MySQL pool, site settings reads, user list loading, and common indexes for 2C4G servers.
- Added Trash batch restore and batch permanent delete with server-side permission checks.
- Added lightweight slow-request logs for requests over 300ms.

Updated at: 2026-05-25 00:56:50 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.2.2

Version: `1.2.2`

Display version: `v1.2.2`

Changes in this release:

- Tightened production JS chunk names so module purpose is not exposed through filenames.
- Kept login, session, request, crypto, and editor code in separate chunks while keeping the entry chunk small.
- Reduced obvious API wrapper and endpoint-map names in production output.
- Added the `/users` workspace routes so sign-in now lands in the admin or user document area based on role.
- Trimmed the login route's initial load path; the editor remains lazy-loaded.
- Kept the runtime risk marker lightweight and single-run, without high-frequency scans or heavy fingerprinting.

Updated at: 2026-05-24 17:48:59 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.2.1

Version: `1.2.1`

Changes in this release:

- Fixed the share review page rendering with unstyled fallback controls when the route-level CSS chunk is not loaded quickly enough. The review page styles now load with the admin shell.

Updated at: 2026-05-24 12:57:43 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.2.0

Version: `1.2.0`

Changes in this release:

- Added lightweight production JS obfuscation and moderate distributed chunk splitting for the admin app.
- Split frontend crypto, response decryption, session authorization, and lightweight runtime risk marking into separate modules.
- Replaced the login/register captcha with a math challenge style; addition/subtraction stay within 100, multiplication/division stay within the 10×10 range.
- Added an API endpoint compatibility layer and optional challenge fallback logic while keeping the existing backend compatible.
- Documented the `x.y.z` versioning semantics.

Updated at: 2026-05-24 12:25:05 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)

### 1.0.5

Version: `1.0.5`

Changes in this release:

- Added bulk document deletion.
- Share update operations are no longer counted in operation logs.
- User management now distinguishes super administrators, administrators, and regular users.
- User promotion is limited to super administrators, and users can only be promoted to administrator.

Updated at: 2026-05-10 22:17:48 +08:00

Documentation: [https://d.w92.pw/](https://d.w92.pw/)
