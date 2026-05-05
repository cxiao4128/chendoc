# ChenDoc 文件说明

这个文件是给以后改功能、查 bug、部署前确认用的。默认先看这里，不用每次从目录树里盲摸。

说明范围：

- `chendoc/` 是当前主项目，Vue 管理后台 + Fastify 后端。
- 源码、配置、脚本、手写静态资源逐个说明。
- `node_modules/`、`dist/`、`server/public/admin/`、`data/`、`release/*.zip`、日志、用户上传文件属于依赖/生成/运行数据，不逐个改，按目录说明。
- `../示例文档/` 是旁边保留的旧 PHP/示例实现，放在最后当参考。

## 改功能先看哪里

| 想改的东西 | 先看文件 |
| --- | --- |
| 后端服务怎么启动、路由怎么挂 | `server/src/server.ts`、`server/src/app.ts` |
| 数据表结构 | `server/src/db/schema.ts` |
| 登录、注册、改密码 | `server/src/modules/auth/*`、`apps/admin/src/api/auth.ts`、`apps/admin/src/pages/login/*`、`apps/admin/src/pages/register/*` |
| 前端路由和页面入口 | `apps/admin/src/router/index.ts`、`apps/admin/src/main.ts` |
| 文档列表、编辑器、回收站 | `server/src/modules/docs/*`、`apps/admin/src/pages/docs/*`、`apps/admin/src/components/editor/*` |
| 分享页、分享密码、公开访问 | `server/src/modules/shares/*`、`server/src/modules/public/*`、`apps/admin/src/components/docs/ShareDialog.vue` |
| R2 存储、上传图片/视频 | `server/src/modules/uploads/*`、`server/src/modules/settings/*`、`apps/admin/src/api/uploads.ts`、`apps/admin/src/pages/settings/SettingsStoragePage.vue` |
| 邀请码 | `server/src/modules/invites/*`、`apps/admin/src/pages/invites/*` |
| 部署和打包 | `package.json`、`deploy.sh`、`scripts/preflight-deploy.js`、`scripts/copy-admin-dist.js` |

## 根目录

| 文件/目录 | 用途 |
| --- | --- |
| `.editorconfig` | 编辑器格式约定：UTF-8、LF、2 空格、文件末尾换行。 |
| `.env` | 本机真实环境变量，含密钥、数据库、R2 等敏感配置；不要提交、不要发给别人。 |
| `.env.example` | 环境变量模板，用来对照部署时需要填什么。 |
| `.gitignore` | 忽略依赖、构建产物、数据库、日志、真实 `.env`。 |
| `README.md` | 项目简介、常用命令、管理员初始化和安全提醒。 |
| `DEPLOY_README.md` | 部署包/服务器部署相关说明。 |
| `FILE_GUIDE.md` | 当前这个文件，项目文件地图。 |
| `package.json` | monorepo 根配置，声明 `apps/admin` 和 `server` 两个 workspace，以及统一的 dev/build/test/deploy 命令。 |
| `package-lock.json` | npm 依赖锁定文件，保证安装版本一致。 |
| `deploy.sh` | Linux 服务器部署脚本，负责安装依赖、构建、迁移数据库、启动服务等。 |
| `start.sh` | 服务器启动脚本，通常用于后台启动 ChenDoc 服务。 |
| `stop.sh` | 服务器停止脚本。 |
| `apps/` | 前端管理后台 workspace。 |
| `server/` | 后端 API、数据库、公开分享页渲染。 |
| `scripts/` | 根级维护脚本，主要给构建、部署、备份使用。 |
| `docs/` | 文档目录，目前为空，可放接口、部署、安全审计等说明。 |
| `data/` | SQLite 数据库和运行数据目录；运行时生成，别手改。 |
| `node_modules/` | npm 依赖目录；由 `npm install` 生成，别手改。 |
| `release/` | 打包出来的部署 zip。 |
| `*.log` | 本地开发/检查时产生的日志文件，排查时可以看，功能修改不用碰。 |

## 后端 `server/`

| 文件/目录 | 用途 |
| --- | --- |
| `server/package.json` | 后端 workspace 配置，包含 dev/build/start/db:migrate/admin:init/r2:import/test 命令和后端依赖。 |
| `server/tsconfig.json` | 后端 TypeScript 编译配置。 |
| `server/src/server.ts` | 后端进程入口：构建 Fastify app 并监听 `HOST`/`PORT`。 |
| `server/src/app.ts` | Fastify 应用组装中心：安全头、限流、错误处理、所有模块路由、前端静态资源、SPA fallback。 |
| `server/dist/` | TypeScript 编译后的 JS 产物；由 `npm run build` 生成，不手改。 |
| `server/public/admin/` | 构建后的前端管理后台静态资源；由 `scripts/copy-admin-dist.js` 复制生成，不手改。 |

### 后端配置

| 文件 | 用途 |
| --- | --- |
| `server/src/config/env.ts` | 读取并校验环境变量，整理路径、端口、密钥、上传限制等运行配置。 |
| `server/src/config/jwt.ts` | JWT 签发和校验工具。 |
| `server/src/config/r2.ts` | Cloudflare R2/S3 客户端创建、endpoint、CORS 来源处理。 |

### 后端数据库

| 文件 | 用途 |
| --- | --- |
| `server/src/db/client.ts` | 打开 SQLite 数据库并创建 Drizzle client。 |
| `server/src/db/migrate.ts` | 数据库迁移/建表脚本入口。 |
| `server/src/db/schema.ts` | Drizzle 表结构：用户、邀请码、验证码、加密密钥、会话、空间、文档、分享、上传、版本、设置、操作日志。 |

### 后端中间件

| 文件 | 用途 |
| --- | --- |
| `server/src/middleware/auth.ts` | 登录态鉴权，从请求中解析用户身份。 |
| `server/src/middleware/requireAdmin.ts` | 管理员权限拦截。 |
| `server/src/middleware/rateLimit.ts` | 登录/注册等接口的限流配置。 |
| `server/src/middleware/error.ts` | Fastify 全局错误处理，把异常转成统一响应。 |

### 后端模块

| 文件 | 用途 |
| --- | --- |
| `server/src/modules/auth/auth.routes.ts` | 登录、注册、当前用户、修改密码 API 路由。 |
| `server/src/modules/auth/auth.service.ts` | 登录注册业务逻辑：加密请求解析、密码校验、邀请码注册、改密码。 |
| `server/src/modules/auth/session.service.ts` | 自定义加密会话：创建、校验、清理过期 session。 |
| `server/src/modules/captcha/captcha.routes.ts` | `/api/captcha` 路由。 |
| `server/src/modules/captcha/captcha.service.ts` | 生成和校验验证码，保存验证码哈希和过期状态。 |
| `server/src/modules/crypto/crypto.routes.ts` | `/api/crypto/public-key` 路由，给前端拿服务端公钥。 |
| `server/src/modules/crypto/crypto.service.ts` | RSA 混合加密支持：生成/读取密钥、解密前端提交、加密响应。 |
| `server/src/modules/danger/danger.routes.ts` | 高危文档删除 API：按 ID 查询、强制删除。 |
| `server/src/modules/danger/danger.service.ts` | 高危删除业务逻辑，删除文档并记录操作日志。 |
| `server/src/modules/docs/docs.routes.ts` | 文档 CRUD、搜索、回收站、发布、版本恢复 API 路由。 |
| `server/src/modules/docs/docs.service.ts` | 文档核心业务：列表、创建、更新、软删、硬删、发布、版本记录和恢复。 |
| `server/src/modules/invites/invites.routes.ts` | 管理员邀请码 API：列表、创建、批量创建、禁用、删除。 |
| `server/src/modules/invites/invites.service.ts` | 邀请码生成、过期刷新、状态维护。 |
| `server/src/modules/public/public.routes.ts` | 公开分享 HTML 页面入口 `/r/:shareKey`。 |
| `server/src/modules/public/public.service.ts` | 公开分享页服务：解析分享并选择渲染正常页/密码页/不可用页。 |
| `server/src/modules/public/renderShareHtml.ts` | 公开分享页 HTML 字符串渲染函数。 |
| `server/src/modules/public/sharePageStyle.ts` | 公开分享页内联 CSS。 |
| `server/src/modules/settings/settings.routes.ts` | 站点配置、通用设置、R2 配置读取/保存/测试 API。 |
| `server/src/modules/settings/settings.service.ts` | 设置读写、R2 密钥加密保存、R2 连接测试。 |
| `server/src/modules/shares/shares.routes.ts` | 管理端分享 API 和公开分享 JSON API。 |
| `server/src/modules/shares/shares.service.ts` | 分享创建/更新/删除、分享码/自定义 slug、密码保护、访问令牌、访问计数。 |
| `server/src/modules/shares/shares.service.test.ts` | 分享模块测试，重点覆盖分享密码/公开访问等行为。 |
| `server/src/modules/spaces/spaces.routes.ts` | 文档空间 API：列表、新增、修改、删除。 |
| `server/src/modules/spaces/spaces.service.ts` | 文档空间业务逻辑。 |
| `server/src/modules/uploads/uploads.routes.ts` | 上传策略、预签名上传、上传完成、删除上传记录 API。 |
| `server/src/modules/uploads/uploads.service.ts` | R2 上传核心逻辑：校验文件类型/大小、生成 object key、签名、登记、删除。 |

### 后端脚本

| 文件 | 用途 |
| --- | --- |
| `server/src/scripts/init-admin.ts` | 初始化/修复管理员账号；需要 `.env` 里的默认管理员密码。 |
| `server/src/scripts/import-r2-config.ts` | 从外部文本导入 R2 配置到系统设置表。 |

### 后端工具

| 文件 | 用途 |
| --- | --- |
| `server/src/utils/crypto.ts` | 对配置值做对称加密/解密。 |
| `server/src/utils/date.ts` | 当前时间、分钟/天数偏移、过期判断。 |
| `server/src/utils/inviteCode.ts` | 生成邀请码。 |
| `server/src/utils/maskSecret.ts` | 脱敏密钥、忽略空密钥字段。 |
| `server/src/utils/password.ts` | 密码哈希、密码验证、注册密码强度校验。 |
| `server/src/utils/rsa.ts` | RSA-OAEP base64 加解密底层工具。 |
| `server/src/utils/sanitize.ts` | 文档 HTML 清洗和 HTML 转义，防止危险标签/属性进入公开页。 |

## 前端 `apps/admin/`

| 文件/目录 | 用途 |
| --- | --- |
| `apps/admin/package.json` | 前端 workspace 配置，包含 Vite/Vue/Pinia/TipTap/lucide 等依赖和 dev/build/preview 命令。 |
| `apps/admin/tsconfig.json` | 前端 TypeScript 配置。 |
| `apps/admin/vite.config.ts` | Vite 构建配置。 |
| `apps/admin/index.html` | 管理后台 HTML 模板，挂载 Vue app。 |
| `apps/admin/dist/` | 前端构建产物；由 `npm run build` 生成，不手改。 |

### 前端入口和全局样式

| 文件 | 用途 |
| --- | --- |
| `apps/admin/src/main.ts` | Vue 入口：创建 app，挂 Pinia 和 Router，加载全局样式。 |
| `apps/admin/src/vite-env.d.ts` | Vite 类型声明。 |
| `apps/admin/src/router/index.ts` | 前端路由表和登录/管理员权限守卫。 |
| `apps/admin/src/styles/variables.css` | 全局 CSS 变量。 |
| `apps/admin/src/styles/reset.css` | 浏览器默认样式重置。 |
| `apps/admin/src/styles/base.css` | 全局基础样式。 |

### 前端 API 层

| 文件 | 用途 |
| --- | --- |
| `apps/admin/src/api/request.ts` | fetch 封装：token、请求头、错误处理、加密请求/响应处理入口。 |
| `apps/admin/src/api/auth.ts` | 登录、注册、当前用户 API。 |
| `apps/admin/src/api/captcha.ts` | 获取验证码 API。 |
| `apps/admin/src/api/crypto.ts` | 获取服务端公钥 API。 |
| `apps/admin/src/api/docs.ts` | 文档列表、搜索、创建、详情、更新、删除、恢复、发布、版本 API。 |
| `apps/admin/src/api/invites.ts` | 邀请码列表、创建、批量创建、禁用、删除 API。 |
| `apps/admin/src/api/rsa.ts` | 浏览器端 RSA/AES 混合加密、加密鉴权头、响应解密。 |
| `apps/admin/src/api/settings.ts` | 站点设置、R2 设置、危险删除辅助 API。 |
| `apps/admin/src/api/shares.ts` | 创建、读取、更新、删除分享 API。 |
| `apps/admin/src/api/spaces.ts` | 文档空间列表 API。 |
| `apps/admin/src/api/uploads.ts` | 上传策略、预签名、上传完成 API。 |

### 前端状态和组合函数

| 文件 | 用途 |
| --- | --- |
| `apps/admin/src/stores/auth.ts` | 登录用户、session token、获取当前用户、登出状态。 |
| `apps/admin/src/stores/doc.ts` | 文档列表/当前文档相关共享状态。 |
| `apps/admin/src/stores/settings.ts` | 站点配置等共享设置状态。 |
| `apps/admin/src/composables/useAuth.ts` | 登录/注册页面复用的认证逻辑。 |
| `apps/admin/src/composables/useCaptcha.ts` | 验证码加载和刷新逻辑。 |
| `apps/admin/src/composables/useCryptoPassword.ts` | 密码字段加密提交辅助。 |
| `apps/admin/src/composables/useDocs.ts` | 文档列表、创建、删除等页面逻辑封装。 |
| `apps/admin/src/composables/useShare.ts` | 分享弹窗/分享设置相关逻辑。 |
| `apps/admin/src/composables/useUpload.ts` | 前端文件上传流程：校验、预签名、上传到 R2、回填编辑器。 |
| `apps/admin/src/composables/useViewport.ts` | 响应式视口判断，区分移动端和桌面端布局。 |

### 前端配置和资源

| 文件/目录 | 用途 |
| --- | --- |
| `apps/admin/src/config/site-assets.ts` | 站点 logo、壁纸等静态资源路径配置。 |
| `apps/admin/src/assets/auth-bg.jpg` | 登录/注册背景图。 |
| `apps/admin/src/assets/chendoc-logo.png` | 源码内使用的 ChenDoc logo。 |
| `apps/admin/src/assets/chendoc-wallpaper.jpg` | 源码内使用的壁纸图。 |
| `apps/admin/public/fonts/README.md` | 字体目录说明。 |
| `apps/admin/public/site-assets/chendoc-logo.png` | 构建时原样复制到站点的 logo。 |
| `apps/admin/public/site-assets/chendoc-wallpaper-mirrored.jpg` | 构建时原样复制到站点的壁纸。 |

### 前端页面

| 文件 | 用途 |
| --- | --- |
| `apps/admin/src/pages/admin/App.vue` | 根 Vue 组件，包住整个后台应用。 |
| `apps/admin/src/pages/admin/AdminLayout.vue` | 登录后文档区主布局，组合桌面/移动 shell 和子路由；`/admin` 默认跳到 `/admin/docs`。 |
| `apps/admin/src/pages/admin/admin-layout.css` | 管理后台主布局样式。 |
| `apps/admin/src/pages/login/LoginPage.vue` | 登录页面。 |
| `apps/admin/src/pages/login/login.css` | 登录页面样式。 |
| `apps/admin/src/pages/register/RegisterPage.vue` | 注册页面。 |
| `apps/admin/src/pages/register/register.css` | 注册页面样式。 |
| `apps/admin/src/pages/docs/DocListPage.vue` | 文档列表页。 |
| `apps/admin/src/pages/docs/doc-list.css` | 文档列表页样式。 |
| `apps/admin/src/pages/docs/DocEditorPage.vue` | 文档编辑页，接入 TipTap 编辑器和文档保存逻辑。 |
| `apps/admin/src/pages/docs/doc-editor.css` | 文档编辑页样式。 |
| `apps/admin/src/pages/docs/TrashPage.vue` | 回收站页面。 |
| `apps/admin/src/pages/docs/trash.css` | 回收站样式。 |
| `apps/admin/src/pages/invites/InvitePage.vue` | 邀请码管理页面。 |
| `apps/admin/src/pages/invites/invite.css` | 邀请码页面样式。 |
| `apps/admin/src/pages/reviews/ShareReviewPage.vue` | 管理员审核普通用户公开分享申请的页面。 |
| `apps/admin/src/pages/reviews/share-review.css` | 分享审核页面样式。 |
| `apps/admin/src/pages/settings/SettingsPage.vue` | 站点基础设置页面。 |
| `apps/admin/src/pages/settings/settings.css` | 站点设置页面样式。 |
| `apps/admin/src/pages/settings/SettingsStoragePage.vue` | R2 存储设置页面。 |
| `apps/admin/src/pages/settings/settings-storage.css` | R2 存储设置页面样式。 |
| `apps/admin/src/pages/danger/DangerPage.vue` | 危险操作页面，按 ID 强制删除文档。 |
| `apps/admin/src/pages/danger/danger.css` | 危险操作页面样式。 |

### 前端组件

| 文件 | 用途 |
| --- | --- |
| `apps/admin/src/components/auth/CaptchaInput.vue` | 验证码输入组件。 |
| `apps/admin/src/components/auth/captcha-input.css` | 验证码输入样式。 |
| `apps/admin/src/components/common/ConfirmDialog.vue` | 通用确认弹窗。 |
| `apps/admin/src/components/common/confirm-dialog.css` | 通用确认弹窗样式。 |
| `apps/admin/src/components/common/EmptyState.vue` | 空状态组件。 |
| `apps/admin/src/components/common/empty-state.css` | 空状态样式。 |
| `apps/admin/src/components/docs/DocTree.vue` | 文档树/列表组件。 |
| `apps/admin/src/components/docs/doc-tree.css` | 文档树样式。 |
| `apps/admin/src/components/docs/ShareDialog.vue` | 分享设置弹窗。 |
| `apps/admin/src/components/docs/share-dialog.css` | 分享弹窗样式。 |
| `apps/admin/src/components/editor/ChendocEditor.vue` | TipTap 编辑器主体组件。 |
| `apps/admin/src/components/editor/chendoc-editor.css` | 编辑器主体样式。 |
| `apps/admin/src/components/editor/EditorToolbar.vue` | 编辑器工具栏。 |
| `apps/admin/src/components/editor/editor-toolbar.css` | 编辑器工具栏样式。 |
| `apps/admin/src/components/editor/ImageUploader.vue` | 编辑器图片上传组件。 |
| `apps/admin/src/components/editor/image-uploader.css` | 图片上传组件样式。 |
| `apps/admin/src/components/editor/VideoBlock.vue` | 编辑器内视频块渲染组件。 |
| `apps/admin/src/components/editor/video-block.css` | 视频块样式。 |
| `apps/admin/src/components/editor/chendoc-image-extension.ts` | TipTap 图片扩展，控制图片节点属性/渲染。 |
| `apps/admin/src/components/editor/video-extension.ts` | TipTap 视频扩展，定义视频节点。 |
| `apps/admin/src/components/layout/admin-nav.ts` | 后台侧边栏/导航菜单配置。 |
| `apps/admin/src/components/layout/AppHeader.vue` | 后台顶部栏。 |
| `apps/admin/src/components/layout/app-header.css` | 顶部栏样式。 |
| `apps/admin/src/components/layout/AppSidebar.vue` | 后台侧边栏。 |
| `apps/admin/src/components/layout/app-sidebar.css` | 侧边栏样式。 |
| `apps/admin/src/components/layout/DesktopAppShell.vue` | 桌面端后台外壳布局。 |
| `apps/admin/src/components/layout/MobileAppShell.vue` | 移动端后台外壳布局。 |
| `apps/admin/src/components/layout/mobile-app-shell.css` | 移动端外壳样式。 |

## 根级脚本 `scripts/`

| 文件 | 用途 |
| --- | --- |
| `scripts/backup-sqlite.js` | 备份 SQLite 数据库。 |
| `scripts/copy-admin-dist.js` | 构建后把 `apps/admin/dist` 复制到 `server/public/admin`，让后端可以直接托管前端。 |
| `scripts/preflight-deploy.js` | 部署前检查环境变量、文件、依赖等是否齐全。 |

## 不要手改的生成/运行目录

| 目录/文件 | 用途 |
| --- | --- |
| `node_modules/` | npm 安装出来的依赖。 |
| `apps/admin/dist/` | 前端 Vite 构建产物。 |
| `server/dist/` | 后端 TypeScript 编译产物。 |
| `server/public/admin/` | 复制到后端托管目录的前端产物。 |
| `data/` | SQLite 数据库、临时数据、运行数据。 |
| `release/*.zip` | 已打包的部署包。 |
| `*.log` | 开发服务器、移动端检查、后端运行日志。 |
| `.env` | 本机真实密钥配置，只能对照 `.env.example` 改，别提交。 |

## 工作区旁边的文件

这些不在 `chendoc/` 主项目里，但经常会被用来对照或导入。

| 文件/目录 | 用途 |
| --- | --- |
| `../r2对象存储文件.txt` | R2 对象存储配置文本，`npm run r2:import` 可能会读取它。 |
| `../.tools/` | 本机放的便携工具，比如 ripgrep、PortableGit；不是项目业务代码。 |
| `../示例文档/` | 旧 PHP/示例版本的文档系统，当前主项目是 `chendoc/`，这里只做参考或迁移来源。 |

## 旧 PHP/示例目录 `../示例文档/`

| 文件/目录 | 用途 |
| --- | --- |
| `.htaccess` | Apache 伪静态/访问控制配置。 |
| `.user.ini` | PHP 运行参数配置。 |
| `package.json`、`package-lock.json` | 旧目录里 Node 工具依赖，主要给 R2 上传/解析脚本用。 |
| `api.php` | 旧版 PHP API 入口。 |
| `app_helpers.php` | 旧版 PHP 公共辅助函数。 |
| `auth.php` | 旧版 PHP 登录/鉴权逻辑。 |
| `config.php` | 旧版 PHP 配置。 |
| `database.php` | 旧版 PHP 数据库连接/查询封装。 |
| `debug_db.php` | 旧版数据库调试脚本。 |
| `html_sanitizer.php` | 旧版 HTML 清洗逻辑。 |
| `index.php` | 旧版主页面/编辑管理入口。 |
| `private_storage_receiver.php` | 旧版私有存储接收脚本。 |
| `r2_uploader.php` | 旧版 R2 上传工具。 |
| `upload_wallpapers_to_r2.js` | 把本地壁纸上传到 R2 的 Node 脚本。 |
| `view.php` | 旧版公开查看页面。 |
| `wang-style-cache.css` | 旧版编辑器/展示缓存样式。 |
| `assets/chensdoc-logo.svg` | 旧版 logo。 |
| `css/app.css` | 旧版应用主样式。 |
| `css/base.css` | 旧版基础样式。 |
| `css/docs-system.css` | 旧版文档系统样式。 |
| `css/editor.css` | 旧版编辑器样式。 |
| `css/login.css` | 旧版登录页样式。 |
| `css/view.css` | 旧版公开查看页样式。 |
| `css/wallpaper.css` | 旧版壁纸相关样式。 |
| `deploy/bt-nginx-rewrite.conf` | 宝塔/Nginx 重写配置参考。 |
| `deploy/nginx-share-routes.conf.example` | 分享路由 Nginx 配置参考。 |
| `data/` | 旧版运行数据。 |
| `uploads/` | 旧版用户上传文件。 |
| `wallpapers-local/`、`壁纸轮换/` | 旧版/示例壁纸图片。 |
| `recovery_temp/` | 旧版恢复临时目录。 |

## 常见修改路径

| 任务 | 主要文件 |
| --- | --- |
| 新增后端 API | 在对应 `server/src/modules/<模块>/<模块>.routes.ts` 加路由，在同目录 `*.service.ts` 写业务；最后确认 `server/src/app.ts` 是否已注册模块。 |
| 新增后台页面 | 在 `apps/admin/src/pages/` 新增页面和 CSS，在 `apps/admin/src/router/index.ts` 加路由，在 `components/layout/admin-nav.ts` 加菜单。 |
| 新增数据字段 | 改 `server/src/db/schema.ts` 和对应 service/API 类型，再改前端 API、页面、组件。 |
| 改文档编辑器 | 先看 `apps/admin/src/components/editor/ChendocEditor.vue` 和 `EditorToolbar.vue`，节点扩展看 `chendoc-image-extension.ts`、`video-extension.ts`。 |
| 改公开分享页样式 | 先看 `server/src/modules/public/sharePageStyle.ts`，结构看 `renderShareHtml.ts`。 |
| 改上传限制 | 环境变量看 `.env.example`，后端校验看 `server/src/config/env.ts` 和 `server/src/modules/uploads/uploads.service.ts`。 |
| 改 R2 配置页面 | 后端 `server/src/modules/settings/settings.service.ts`，前端 `apps/admin/src/pages/settings/SettingsStoragePage.vue`。 |
| 发部署包前检查 | 跑 `npm run build`、`npm run test`、`npm run deploy:preflight`，涉及脚本在 `scripts/`。 |
