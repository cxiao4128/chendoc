# 更新日志 / Changelog

语言 / Language: [中文](#中文) | [English](#english)

## 中文

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

- 登录页壁纸改为 small WebP 首屏占位，高清 WebP 提前 preload，避免慢半拍。
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

- Switched the login wallpaper to a small WebP first-paint placeholder and preloaded full WebP image.
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
