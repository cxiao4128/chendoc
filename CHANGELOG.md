# 更新日志 / Changelog

语言 / Language: [中文](#中文) | [English](#english)

## 中文

### 3.4.1

版本号：`3.4.1`

展示版本：`v3.4.1`

**覆盖部署残留文件修复**

- 正常服务器部署在构建前清理已废弃的移动编辑器组件和样式，避免覆盖解压升级后旧文件残留导致 `vue-tsc` 报错。
- 保留 `.env`、数据库、上传内容和备份目录，仅清理已经从发行版删除的源码文件。
- 本次 GitHub 发布包含未单独发布的 `3.4.0`：移动端编辑器重构、iOS Safari 上传兼容、上传签名校验与完成竞态修复、分享页颜色/高亮恢复及阅读元信息移除。
- 修正文档版本加密密钥版本字段类型，避免字符串密钥版本被错误转换为数字。
- 修复架构检查器在 Linux CI 中无法匹配既有违规白名单的问题，保证 GitHub 发布流水线与 Windows 本地检查结果一致。

更新时间：2026-07-15 +08:00

### 3.4.0

版本号：`3.4.0`

展示版本：`v3.4.0`

**移动端编辑与分享显示修复**

- 重做移动端文档编辑器布局，采用全宽白色正文区、紧凑顶栏、底部编辑工具栏，并适配软键盘与安全区。
- 修复 iOS Safari 等移动浏览器上传图片、视频和附件时的格式识别问题；上传前按文件真实内容校准安全 MIME 与扩展名，服务端继续严格校验文件签名。
- 分享页恢复正文文字颜色和高亮背景，仅放行受控的十六进制颜色样式。
- 分享页移除“更新于 · 约 X 分钟阅读”元信息。

更新时间：2026-07-15 +08:00

### 3.3.1

版本号：`3.3.1`

展示版本：`v3.3.1`

**真正的纯后端部署包**

- 新增 `backend.zip`，只包含 API 服务、数据库维护脚本和后端部署入口，不含任何管理端源码或静态产物。
- 纯后端部署会清理旧一体化包残留的 `apps/` 与 `server/public/`，避免服务器继续占用前端磁盘资源。
- 后端包预编译 API，部署时只安装运行依赖，强制 `CHENDOC_SERVE_ADMIN=false`，并验证 `/`、`/login` 均为 404。
- 保留 `server.zip` 作为正常一体化部署包，Cloudflare Pages 与服务器前端可随时切换。
- MySQL 备份增加 `--no-tablespaces`，无需 `PROCESS` 权限；恢复验证按备份实际表结构执行，支持安全验证迁移前旧版本数据库。

更新时间：2026-07-13 +08:00

### 3.3.0

版本号：`3.3.0`

展示版本：`v3.3.0`

**Cloudflare Pages Git 自动部署**

- 新增 Pages 专用构建命令，GitHub `main` 推送后可由 Cloudflare 自动构建 `apps/admin/dist`。
- Pages 构建强制注入独立 API 与展示域名，统一生成运行时配置、SPA 回退、安全响应头和 CSP。
- Pages 与发布 ZIP 复用同一套来源校验和配置生成器，拒绝示例域名、HTTP 来源、源码、环境文件、source map 和服务端密钥赋值进入静态产物。
- 固定 Pages 构建环境为 Node.js `22.16.0`，CI 同步验证专用 Pages 构建。
- 增加 Direct Upload 向 Git Integration 迁移、自动更新、域名迁移与回滚说明。

更新时间：2026-07-13 +08:00

### 3.2.1

版本号：`3.2.1`

展示版本：`v3.2.1`

**Cloudflare Pages 完整前端剥离**

- `d.w92.pw` 统一承载登录、后台、公开分享和公开表单等全部 Vue SPA 页面。
- `api.w92.pw` 仅承载 Gateway、认证、数据库、文档、分享数据、表单提交和 R2 预签名等动态 API。
- 公开分享与表单页面改为独立懒加载前端路由，继续保持 `/r/{分享码}` 与 `/f/{表单码}` 地址格式。
- 保持现有 Gateway 协议、action code、分享码规则、数据库结构、权限体系和 R2 直传链路不变。
- Cloudflare Pages 包分别写入 API Base URL 与 Public Site URL，并保留服务器静态前端回退开关。

更新时间：2026-07-12 +08:00

### 3.2.0

版本号：`3.2.0`

展示版本：`v3.2.0`

**双部署支持**

- 新增 Cloudflare Pages 静态管理端包和正常一体化服务器包，统一生成 SHA-256 校验文件。
- 增加运行时 API/公开页来源配置；Gateway、公钥、挑战、普通 API、分享和收集表链接均支持独立后端来源。
- 后端增加精确来源 CORS、凭据预检和 API-only 模式，保持加密 Gateway 与内存 JWT 方向不变。
- R2 浏览器来源与 `PUBLIC_SITE_URL` 解耦，静态管理端可完成预签名直传。
- 修复旧发布脚本路径重复嵌套、PowerShell/Node/CI 三套规则不一致和默认执行 Git 发布的问题。
- 发布包改为源码路径白名单，清除含凭据的调试脚本，并阻断示例域名直接进入生产。
- 分享链接码与访问密码隔离浏览器账号自动填充，自动保存不再携带被污染的凭据字段。

更新时间：2026-07-12 +08:00

### 3.1.1

版本号：`3.1.1`

展示版本：`v3.1.1`

**Bug 修复**

- 修复开启或关闭公开分享后文档修订号漂移，导致后续自动保存持续冲突失败的问题。
- 公开分享首次开启时一次完成分享码分配与启用，并在分享面板明确显示系统分享码。
- 修复载入已有分享时触发无效自动更新、可能清空自定义链接码的问题。
- 上传缺少 R2 配置时显示可执行的配置提示。
- 修复文档版本加密占位符测试与当前存储格式不一致的问题。
- 合并相互依赖的认证核心分包，消除构建时循环 chunk 警告。
- 清理文档 store 的旧 API 直连，恢复架构边界检查。
- 修复本地草稿显示、跨文档保存竞态、历史恢复旧缓存、列表缓存和字数同步。
- 修复分享连续切换竞态、自定义链接码冲突、纯数字分享码与系统码命名空间冲突。
- 分享密码变化后立即废止旧访问令牌，搜索建议和定时发布补齐权限隔离。
- 补齐搜索、定时发布、版本、评论、标签、模板、统计的加密网关动作映射。
- 注册标签、模板、统计路由，并补齐 SQLite/MySQL 功能表迁移。
- 修复登录未写恢复 Cookie、HTTP 环境刷新 Cookie 错误标记 Secure。
- 修复 R2 脱敏密钥被覆盖、配置半保存、上传完成竞态误删对象、请求取消信号失效。
- R2 测试不再要求桶管理权限，改为真实对象读写；上传测试同时验证预签名 PUT 与浏览器 CORS。
- 修复 Playwright 测试端口与启动端口不一致，并补充桌面端、移动端登录冒烟测试。
- E2E 按桌面/移动场景分配项目，避免把桌面专属用例错误重复到所有移动设备。
- 清除被跟踪测试环境文件中的真实密钥，发布包统一排除除 `.env.example` 外的全部 `.env*`。
- GitHub Release 与 PowerShell 打包链路同步阻断所有非模板 `.env*` 文件。
- 发布包恢复携带锁文件和站点运行图片；修正 PM2 安装提示，保证部署依赖可复现。
- 取消错误的测试、运行配置和源码图片忽略规则；CI 与根测试纳入前端测试。
- 本地双包改为顶层白名单扫描，未跟踪的旁路目录不再混入发布包。
- 补齐备份恢复验证的新功能表清单，以及 MySQL 会话并发刷新所需的 `version` schema。
- 部署预检校验完整 R2 配置、数据库覆盖值及配置/RSA 密钥可解密性。
- 修复静态资源自定义缓存头被框架覆盖，哈希资源恢复一年 immutable 缓存。
- 修复公开分享缓存绕过禁用/过期检查、SQLite 并发事务和版本恢复覆盖新保存。

更新时间：2026-07-09 +08:00

### 3.1.0

版本号：`3.1.0`

展示版本：`v3.1.0`

**架构重构**

- 新增 `修改架构.md`，记录模块化重构任务、阶段进度、风险、验证和回滚方式。
- 新增前端模块化骨架：`services/http`、`services/api`、`features`、`hooks`、`layouts`、`types`。
- 新增基础 hooks、app/route store、Loading/Error/Forbidden/PermissionGuard 状态组件。
- 上传、导出、GitHub 版本检查下沉到独立 service，页面和组件减少直接业务请求。
- Gateway 补齐导出动作码，导出接口继续走加密 packet layer。

更新时间：2026-07-04 +08:00

### 3.0.1

版本号：`3.0.1`

展示版本：`v3.0.1`

**Bug 修复**

- 修复自定义分享码为纯数字时被错误拒绝的问题，管理员可设置如"21221"这样的纯数字分享码。
- 修复评论功能数据库表缺失问题，新增 `doc_comments` 表用于存储文档评论。

**功能完善**

- 优化文档编辑器的分享面板，支持自定义分享码输入和密码管理。
- 分享页专属信息（shareFooterText）正确显示在分享页正文下方。

更新时间：2026-07-02 +08:00

### 3.0.0

版本号：`3.0.0`

展示版本：`v3.0.0`

**核心架构/功能升级**

- 深色模式：支持主题切换，自动跟随系统偏好
- 编辑器增强：颜色批注功能，文字颜色和背景色选择器
- 移动端优化：响应式布局，触摸友好的编辑器工具栏
- 看板视图：支持看板模式查看和管理文档
- 大文档性能优化：虚拟滚动，懒加载优化
- 全文搜索增强：高亮匹配、排序优化、搜索建议和历史记录
- 标签系统：多级标签、批量操作、合并/重命名、使用统计、树形展示
- PDF导出：支持将文档导出为PDF格式
- 文档评论批注：支持文档内评论和批注功能
- 定时发布：支持文档定时发布
- 开放API：提供RESTful API接口
- Vitest v4配置升级：修复poolOptions配置弃用警告
- TipTap统一升级至3.27.1版本

更新时间：2026-07-01 +08:00

### 2.9.3

版本号：`2.9.3`

展示版本：`v2.9.3`

- 修复旧 MySQL 库里 `fk_docs_owner` 仍为 `ON DELETE SET NULL` 时，部署迁移无法把 `docs.owner_id` 改为 `NOT NULL` 的问题。
- 迁移会先移除 `docs.owner_id` 的旧外键，再按 `ON DELETE RESTRICT` 重建，保持文档必须有所有者的安全边界。

更新时间：2026-06-24 +08:00

### 2.9.2

版本号：`2.9.2`

展示版本：`v2.9.2`

- R2 对象备份改为显式可选：未配置 `R2_BACKUP_BUCKET` 时部署预检只警告，不再阻塞不需要对象备份的部署。
- 新增 `CHENDOC_REQUIRE_R2_BACKUP` 开关；设为 `true` 时仍强制要求独立 R2 备份桶。

更新时间：2026-06-24 +08:00

### 2.9.1

版本号：`2.9.1`

展示版本：`v2.9.1`

- 分享码改为系统分配：管理员文档使用 `111-9999` 短码按当前最大值递增，普通用户文档使用 7 位随机码。
- 禁止后台、编辑页和审核接口手动指定分享码，避免普通用户分享被改成管理员短码或管理员短码被随意跳号。
- 编辑页分享面板改为只读展示分享码，审核页通过/驳回不再提交人工分享码。

更新时间：2026-06-23 +08:00

### 2.9.0

版本号：`2.9.0`

展示版本：`v2.9.0`

- 修复 `share_token` 等于分享数字的问题；新分享使用随机 token，旧弱 token 会在迁移和分享更新时自动轮换。
- 分享页不可用状态统一返回 404 和通用文案，减少 disabled/expired/deleted/missing 的枚举信号。
- MySQL 文档搜索增加 `docs_search_fulltext_idx` 全文索引，并在 MySQL 查询中优先使用 `MATCH ... AGAINST`。
- 明确 Gateway Packet Layer 只负责传输加固，不替代 `authenticate`、`requireSuperAdmin`、`canAccessDocument`，并加入架构检查。
- R2 上传场景下部署预检强制要求 `R2_BACKUP_BUCKET`；维护 cron 缺失会使部署失败，避免对象清理/备份被静默跳过。

更新时间：2026-06-23 +08:00

### 2.8.0

版本号：`2.8.0`

展示版本：`v2.8.0`

- 保留 `shareId=111–9999` 业务短编号，公开接口不再返回文档标识、所有者或数据库主键；分享访问增加独立限流、访问日志、所有者状态和完整发布状态校验。
- 普通管理员改为仅管理自己文档；超级管理员改为数据库显式标记，不再依赖配置用户名推断。
- 修复脱离文档后的上传越权删除；上传完成增加真实文件签名检查，R2 测试校验受限 CORS 并删除探测对象。
- 登录会话增加 HttpOnly、SameSite=Strict 恢复凭据，刷新页面可恢复会话；禁用账号仍立即拒绝恢复。
- 修复每日备份校验缺少路径、验证库重复恢复、部署前未验证备份及健康检查不探测数据库的问题。
- 修复模板正文 JSON 丢失、知识库只读取第一页、移动文档卡片拉伸、桌面表格截断、设置页签截断和回收站保留期误导。
- 系统概览和用户文档统计改为 SQL 聚合；大文档增加 4MB 限制和自适应编辑器防抖；孤儿对象扫描改为有游标的分批任务。
- TOTP 明确定位为失败风险挑战和危险操作验证，不宣称每次登录强制双因素认证。

更新时间：2026-06-22 +08:00

### 2.7.0

版本号：`2.7.0`

展示版本：`v2.7.0`

- 收紧超级管理员、普通管理员、普通用户的服务端权限边界，永久删除统一要求二次验证。
- 增加文档修订号、删除者、唯一分享关系、上传配额、文档绑定、生产扫描和数据库复合索引。
- 文档、历史版本、分享审核和可见性更新改为事务提交；编辑器增加 IndexedDB 本地草稿和冲突检测。
- 修复草稿被自动发布、回收站虚假容量与倒计时、登录账号枚举、Gateway 内部头伪造和双重 RSA 开销。
- 部署增加 PM2 健康检查、失败回滚、维护计划、数据库校验和 R2 备份任务。

更新时间：2026-06-21 +08:00

### 2.6.2

版本号：`2.6.2`

展示版本：`v2.6.2`

本次更新内容：

- 修复收集表编辑器变量作用域失效、列表列错位、草稿复制无效链接和提交记录翻页编号错误。
- 删除无实际能力的题型与伪操作入口；补齐草稿保存、发布状态、移动端三步编辑和真实字段预览。
- 修复分节标题被当作提交字段、仅含分节也能发布、空提交上限无法保存、专属信息名称不可编辑等问题。
- 加强公开表单字段契约、预设字段校验、必填单选、成功页字段名称和内联 JSON 编码。
- 提交记录统一使用来源摘要，不再把匿名摘要误称为原始 IP；导出和详情跳过分节字段。
- 文档编辑器不再为单文档保留空白切换区；只有目录时直接顶置目录，无内容时收起整块左栏。
- 删除文档移入“更多”菜单，避免危险按钮换行成横向误触区；修正编辑器工具栏列数和窄屏收缩。

更新时间：2026-06-21 +08:00

### 2.6.1

版本号：`2.6.1`

展示版本：`v2.6.1`

本次更新内容：

- 修复 MariaDB/旧版 MySQL 不支持 `TEXT DEFAULT ('[]')` 导致收集表建表失败。
- `forms.fields` 改为无默认值的非空字段；应用创建表单时继续显式写入字段 JSON。
- 增加跨 MySQL 变体 DDL 回归测试。
- 新增 `.gitattributes`，强制 Linux 部署脚本使用 LF，避免 `pipefail\r` 错误。
- 修复宝塔/Nginx 本机反向代理未传或未被信任 `X-Forwarded-Proto` 时，HTTPS 登录被误判并返回 `HTTPS is required`。
- 默认仅信任 `127.0.0.1`、`::1` 代理；显式 HTTP 转发仍会拒绝，远程伪造头不会被信任。

更新时间：2026-06-21 +08:00

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

### 3.4.1

Version: `3.4.1`

Display version: `v3.4.1`

**In-place deployment stale-file fix**

- The normal server deployment now removes retired mobile-editor components and styles before building, preventing stale files from older overlaid archives from breaking `vue-tsc`.
- `.env`, databases, uploads, and backup directories remain untouched; only source files removed from the release are pruned.
- This GitHub release includes the previously unpublished `3.4.0`: the mobile-editor redesign, iOS Safari upload compatibility, upload signature/finalization race fixes, restored shared-page colors and highlights, and removal of reading metadata.
- Fixed document-version encryption key-version types so string key versions are no longer coerced to numbers.
- Fixed architecture-check allowlist matching on Linux CI so GitHub release checks agree with Windows local checks.

Updated: 2026-07-15 +08:00

### 3.4.0

Version: `3.4.0`

Display version: `v3.4.0`

**Mobile editing and shared-page rendering fixes**

- Redesigned the mobile document editor with a full-width white canvas, compact header, bottom editing toolbar, keyboard avoidance, and safe-area support.
- Fixed image, video, and attachment uploads from mobile browsers such as iOS Safari by normalizing safe MIME types and extensions from actual file content while retaining strict server-side signature validation.
- Restored text colors and highlight backgrounds on shared pages with an allowlist limited to controlled hexadecimal color values.
- Removed the “Updated · X min read” metadata from shared pages.

Updated: 2026-07-15 +08:00

### 3.3.1

Version: `3.3.1`

Display version: `v3.3.1`

**True backend-only deployment package**

- Added `backend.zip` containing only the API service, database maintenance scripts, and backend deployment entry points, with no admin source or static assets.
- Backend-only deployment removes stale `apps/` and `server/public/` directories left by older all-in-one packages, eliminating frontend disk usage on the API server.
- The backend package ships a precompiled API and installs runtime dependencies only, forces `CHENDOC_SERVE_ADMIN=false`, and verifies that `/` and `/login` both return 404.
- Retained `server.zip` as the normal all-in-one package so the Cloudflare Pages and server-hosted frontend modes remain switchable.
- Added `--no-tablespaces` to MySQL backups and changed restore verification to follow the dump's actual table set, allowing safe verification of pre-migration databases without `PROCESS` privilege.

Updated: 2026-07-13 +08:00

### 3.3.0

Version: `3.3.0`

Display version: `v3.3.0`

**Automatic Cloudflare Pages deployment from GitHub**

- Added a Pages-only build command so Cloudflare can build `apps/admin/dist` automatically after pushes to GitHub `main`.
- Made the Pages build require separate API/public origins and generate runtime configuration, SPA fallback, security headers, and CSP.
- Reused one validated configuration generator for Git builds and release ZIPs, blocking example/HTTP origins, sources, environment files, source maps, and server-secret assignments from static output.
- Pinned the Pages build image to Node.js `22.16.0` and added the dedicated Pages build to CI validation.
- Documented Direct Upload migration, automated updates, custom-domain transfer, and rollback.

Updated: 2026-07-13 +08:00

### 3.2.1

Version: `3.2.1`

Display version: `v3.2.1`

**Complete Cloudflare Pages frontend separation**

- `d.w92.pw` now serves every Vue SPA surface, including login, admin, public shares, and public forms.
- `api.w92.pw` is limited to dynamic Gateway, authentication, database, document, share-data, form-submit, and R2-presign APIs.
- Public share and form views are independently lazy-loaded while retaining `/r/{shareCode}` and `/f/{formCode}` URLs.
- Existing Gateway packets, action codes, share-code rules, database schema, permissions, and direct-to-R2 uploads remain unchanged.
- The Pages package now carries separate API and public-site origins while retaining the server-hosted frontend rollback switch.

Updated: 2026-07-12 +08:00

### 3.2.0

Version: `3.2.0`

Display version: `v3.2.0`

**Dual deployment support**

- Added a Cloudflare Pages static-admin package, a normal all-in-one server package, and SHA-256 checksums.
- Added runtime API/public origins across Gateway, key/challenge, direct API, share links, and public-form links.
- Added exact-origin credentialed CORS and API-only backend mode without weakening the encrypted Gateway or in-memory JWT model.
- Separated browser R2 origins from `PUBLIC_SITE_URL` for split-origin presigned uploads.
- Replaced divergent broken packaging paths with one verified package source and removed implicit Git publishing.
- Switched release contents to a source-path allowlist, removed credential-bearing debug scripts, and rejected placeholder production domains.
- Isolated share slug/password fields from account autofill and blocked polluted fields from automatic persistence.

Updated: 2026-07-12 +08:00

### 3.1.1

Version: `3.1.1`

Display version: `v3.1.1`

**Bug fixes**

- Prevented share visibility changes from advancing document revisions and breaking later autosaves.
- Made first-time public sharing allocate and enable the system share code atomically, with the code shown in the share panel.
- Prevented share hydration from issuing an unintended update that could clear a custom slug.
- Added actionable guidance when uploads are blocked by missing R2 configuration.
- Updated the encrypted document-version placeholder test to match the current storage format.
- Merged mutually dependent authentication core chunks to remove the circular build warning.
- Removed legacy API imports from the document store and restored clean architecture checks.
- Fixed local-draft rendering, cross-document save races, stale version-restore caches, list caches, and word counts.
- Serialized rapid share changes and prevented custom-slug and numeric system-code namespace collisions.
- Invalidated old public tokens after password changes; tightened search-suggestion and schedule permissions.
- Completed encrypted Gateway mappings for search, schedules, versions, comments, tags, templates, and stats.
- Registered tags, templates, and stats routes; added missing SQLite/MySQL feature-table migrations.
- Restored login cookies and fixed Secure-cookie handling for local HTTP refreshes.
- Preserved masked R2 credentials, made R2 settings atomic, fixed upload completion races, and preserved abort signals.
- Reworked R2 tests to use real object operations without bucket-admin permission and verify presigned PUT plus browser CORS.
- Aligned the Playwright and server test ports and added desktop/mobile login smoke coverage.
- Scoped E2E projects by desktop/mobile intent instead of replaying desktop-only suites on every device.
- Removed real secrets from tracked test environment data and excluded every `.env*` file except `.env.example` from releases.
- Applied the same `.env*` release guard to GitHub archives and the PowerShell packaging path.
- Restored the lockfile and runtime site images in release packages and corrected the PM2 installation guidance.
- Stopped ignoring tests, runtime configs, and source images; frontend tests now run in CI and the root test command.
- Restricted local release packaging to an explicit top-level allowlist so unrelated untracked directories cannot leak into archives.
- Updated backup verification for all feature tables and added the MySQL auth-session `version` schema.
- Deployment preflight now validates complete/effective R2 settings and decryptability of stored configuration and RSA keys.
- Prevented the static plugin from overriding custom long-lived cache headers for hashed assets.
- Fixed public-share cache validation, SQLite transaction serialization, and concurrent version restoration.

Updated: 2026-07-09 +08:00

### 3.1.0

Version: `3.1.0`

Display version: `v3.1.0`

**Architecture Refactor**

- Added `修改架构.md` to track modular refactor tasks, progress, risks, validation, and rollback notes.
- Added the first frontend modular architecture layer: `services/http`, `services/api`, `features`, `hooks`, `layouts`, and `types`.
- Added base hooks, app/route stores, and Loading/Error/Forbidden/PermissionGuard state components.
- Moved upload, export, and GitHub version-check logic behind domain services.
- Added Gateway export action mappings so export APIs continue through the encrypted packet layer.

Updated at: 2026-07-04 +08:00

### 3.0.1

Version: `3.0.1`

Display version: `v3.0.1`

**Bug Fixes**

- Fixed custom share codes with pure numbers being incorrectly rejected; admins can now set share codes like "21221".
- Fixed missing `doc_comments` database table for document comments feature.

**Enhancements**

- Optimized document editor share panel with custom share code input and password management.
- Share page exclusive info (shareFooterText) correctly displays below content.

Updated at: 2026-07-02 +08:00

### 3.0.0

Version: `3.0.0`

Display version: `v3.0.0`

Changes:

- Dark mode: Theme switching support, auto-detect system preference
- Editor enhancement: Color annotation feature, text color and background color pickers
- Mobile optimization: Responsive layout, touch-friendly editor toolbar
- Kanban view: Kanban mode for document management
- Large document performance optimization: Virtual scrolling, lazy loading
- Full-text search enhancement: Match highlighting, sort optimization, search suggestions and history
- Tag system: Hierarchical tags, batch operations, merge/rename, usage statistics, tree view
- PDF export: Export documents to PDF format
- Document comments and annotations: Support for in-document comments and annotations
- Scheduled publishing: Document scheduled publishing support
- Open API: RESTful API endpoints
- Vitest v4 config upgrade: Fixed poolOptions deprecation warnings
- TipTap unified upgrade to version 3.27.1

Updated at: 2026-07-01 +08:00

### 2.9.3

Version: `2.9.3`

Display version: `v2.9.3`

Changes:

- Fixed deployment migration failures on older MySQL databases where `fk_docs_owner` still used `ON DELETE SET NULL`, which blocked changing `docs.owner_id` to `NOT NULL`.
- The migration now drops the old `docs.owner_id` foreign key first, then recreates it with `ON DELETE RESTRICT` to preserve the required document-owner boundary.

Updated at: 2026-06-24 +08:00

### 2.9.2

Version: `2.9.2`

Display version: `v2.9.2`

Changes:

- Made R2 object backup explicitly optional: when `R2_BACKUP_BUCKET` is not set, deploy preflight now warns instead of blocking deployments that do not want object backup.
- Added `CHENDOC_REQUIRE_R2_BACKUP`; setting it to `true` keeps the independent R2 backup bucket requirement.

Updated at: 2026-06-24 +08:00

### 2.9.1

Version: `2.9.1`

Display version: `v2.9.1`

Changes:

- Share codes are now system-assigned: admin documents use ascending `111-9999` short codes, and ordinary user documents use random 7-digit codes.
- Admin, editor, and review APIs no longer accept manual share-code assignment.
- The editor share panel shows the code as read-only, and review approval/rejection no longer submits a human-edited code.

Updated at: 2026-06-23 +08:00

### 2.9.0

Version: `2.9.0`

Display version: `v2.9.0`

- Fixed `share_token` values that mirrored share codes; new shares use random tokens, and old weak tokens rotate during migration or share updates.
- Unified unavailable public share pages to a generic 404 response to reduce disabled/expired/deleted/missing enumeration signals.
- Added a MySQL full-text index for document search and switched MySQL document queries to `MATCH ... AGAINST`.
- Documented Gateway Packet Layer as transport hardening only, not authorization, and added architecture checks for the required server-side guards.
- Made R2 deployments require `R2_BACKUP_BUCKET` when uploads are configured, and made missing maintenance cron fail instead of silently skipping cleanup and backups.

Updated: 2026-06-23 +08:00

### 2.8.0

Version: `2.8.0`

Display version: `v2.8.0`

- Kept the memorable `shareId=111–9999` business identifier while removing document and database identifiers from public responses; added dedicated rate limits, access logs, owner-state checks, and full publication checks.
- Restricted ordinary administrators to their own documents and replaced username-derived super-admin identity with an explicit database flag.
- Closed detached-upload deletion authorization gaps, added file-signature checks, validated restricted R2 CORS, and removed probe objects.
- Added HttpOnly SameSite session restoration without weakening disabled-account revocation.
- Fixed backup verification arguments, repeatable restore verification, pre-deploy backup validation, and database-aware health checks.
- Fixed template JSON loss, first-page-only knowledge loading, responsive document layouts, settings tabs, and recycle-bin retention copy.
- Replaced full-table overview aggregation with SQL aggregates, bounded large documents, adapted editor debounce, and paged orphan-object scans.
- Documented TOTP as a risk challenge and dangerous-operation verification, not mandatory MFA on every login.

Updated: 2026-06-22 +08:00

### 2.7.0

Version: `2.7.0`

Display version: `v2.7.0`

- Enforced server-side super-admin, administrator, and user boundaries; permanent deletion now requires fresh verification.
- Added document revisions, deletion actors, one-share-per-document constraints, upload quotas, document binding, production scanning, and query indexes.
- Made document/version/share visibility updates transactional; added durable IndexedDB drafts and stale-write conflict detection.
- Fixed silent draft publishing, fake trash metrics, login account enumeration, forged Gateway internal headers, and duplicate RSA work.
- Added PM2 health checks, failed-build rollback, scheduled maintenance, log rotation, and R2 backup support.

Updated: 2026-06-21 +08:00

### 2.6.2

Version: `2.6.2`

Display version: `v2.6.2`

Changes:

- Fixed form-editor token scope, list column alignment, invalid draft-link copying, and paginated submission numbering.
- Removed nonfunctional field types and placeholder actions; added explicit draft saving, honest publishing state, mobile step editing, and faithful previews.
- Fixed section fields being submitted, section-only forms being publishable, cleared limits failing validation, and uneditable exclusive-info labels.
- Hardened public field contracts, preset validation, required radio groups, success-page labels, and inline JSON encoding.
- Renamed anonymous source digests consistently and excluded section fields from exports and submission details.
- Removed the empty document-switching region for single-document editing and promoted the outline when it is the only useful left-side content.
- Moved document deletion into the More menu and fixed toolbar columns so the danger action cannot wrap into a wide accidental-click target.

Updated at: 2026-06-21 +08:00

### 2.6.1

Version: `2.6.1`

Display version: `v2.6.1`

Changes:

- Fixed form table creation on MariaDB and older MySQL variants that reject `TEXT DEFAULT ('[]')`.
- Kept `forms.fields` required without a database default; form creation still writes the JSON explicitly.
- Added a cross-variant DDL regression test.
- Added `.gitattributes` to keep Linux deployment scripts on LF and prevent `pipefail\r` failures.
- Fixed HTTPS login being rejected with `HTTPS is required` behind a local BT/Nginx reverse proxy when `X-Forwarded-Proto` was absent or not trusted.
- Trusts only `127.0.0.1` and `::1` by default; explicit HTTP forwarding and spoofed remote headers remain rejected.

Updated at: 2026-06-21 +08:00

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
