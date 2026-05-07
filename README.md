# ChenDoc / 陈书

当前版本：`v1.03`

[English](#english) | [中文](#中文)

## 中文

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
- 后端：Node.js 20+、Fastify、TypeScript、Drizzle ORM、SQLite。
- 存储：SQLite 保存业务数据，Cloudflare R2 或 S3 兼容对象存储保存上传文件。

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
- `DATABASE_URL`：SQLite 数据库路径。
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

从 GitHub Release 下载部署压缩包后，在你的部署目录内解压并执行：

```bash
unzip -o chendoc-v1.03-*.zip
cp .env.example .env
# 编辑 .env，填写生产环境配置
bash ./deploy.sh
```

首次部署并初始化管理员时：

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

部署脚本会检查环境、安装依赖、构建前后端、执行数据库迁移，并通过 PM2 启动服务。反向代理目标为：

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
docs/                    项目说明文档
data/                    运行数据和 SQLite 数据库，不提交
server/public/admin/     构建后由后端托管的前端产物
```

更详细的文件地图见 `FILE_GUIDE.md`。

### 安全提示

- 不要公开 `.env`、数据库、日志和部署机密钥。
- 首次部署后请确认管理员密码、JWT 密钥、配置加密密钥和 RSA 私钥加密密钥均已替换。
- R2 Access Key 和 Secret 只保存在服务端配置中，前端不会直接暴露密钥。
- 上线前建议测试公开分享权限、分享审核、注册卡密和 R2 上传链路。

## English

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
- Backend: Node.js 20+, Fastify, TypeScript, Drizzle ORM, SQLite.
- Storage: SQLite for application data, Cloudflare R2 or S3-compatible object storage for uploaded files.

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
- `DATABASE_URL`: SQLite database path.
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
unzip -o chendoc-v1.03-*.zip
cp .env.example .env
# Edit .env for production settings.
bash ./deploy.sh
```

For the first deployment with admin initialization:

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

The deployment script checks the environment, installs dependencies, builds the frontend and backend, runs database migrations, and starts the service through PM2. Reverse proxy target:

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
docs/                    Project documentation
data/                    Runtime data and SQLite database, not committed
server/public/admin/     Built frontend served by backend
```

See `FILE_GUIDE.md` for a more detailed file map.

### Security Notes

- Do not publish `.env`, databases, logs, or deployment secrets.
- After the first deployment, confirm that the admin password, JWT secret, config encryption key, and RSA private-key encryption key have all been replaced.
- R2 access keys are stored only on the server side and are not exposed directly to the frontend.
- Before going live, test public sharing, share review, invite codes, and R2 upload behavior.

## Open Source

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)
