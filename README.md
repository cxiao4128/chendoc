# ChenDoc / 陈书

ChenDoc 是一个轻量的私有文档系统，适合部署在个人服务器或小团队内部使用。它提供文档编辑、公开分享、分享审核、注册卡密、回收站、R2 对象存储配置、操作日志和后台系统管理。

当前版本：`v1.02`

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、TipTap
- 后端：Node.js 20+、Fastify、TypeScript、Drizzle ORM、SQLite
- 存储：SQLite 保存业务数据，Cloudflare R2/S3 兼容对象存储保存上传文件

## 功能概览

- 文档创建、编辑、搜索、回收站和历史版本
- 文档公开分享、访问密码、分享码和自定义短链接
- 普通用户公开分享审核
- 注册卡密管理
- R2 配置保存、连接测试和上传测试
- 系统管理页：操作日志、站点外观、版本号、更新检查、开源链接
- 管理端登录、注册、验证码和加密会话

## 环境要求

- Node.js `20` 或更高版本
- npm
- Linux 服务器建议使用 Nginx 或宝塔反向代理到 `http://127.0.0.1:8985`

## 本地开发

```bash
npm install
npm run dev
```

默认前端开发服务运行在 `5175`，后端运行在 `.env` 中配置的 `PORT`。

## 构建与运行

```bash
npm install
npm run build
npm run db:migrate
npm start
```

## 环境变量

复制模板后填写真实配置：

```bash
cp .env.example .env
```

重点配置：

- `PUBLIC_SITE_URL`：站点公网地址
- `DATABASE_URL`：SQLite 数据库路径
- `JWT_SECRET`：登录会话密钥
- `CONFIG_ENCRYPTION_KEY`：配置加密密钥
- `RSA_PRIVATE_KEY_ENCRYPTION_KEY`：RSA 私钥加密密钥
- `DEFAULT_ADMIN_USERNAME`：初始化管理员用户名
- `DEFAULT_ADMIN_PASSWORD`：初始化管理员密码
- `R2_*`：Cloudflare R2 或 S3 兼容存储配置

不要提交 `.env`。生产环境请使用唯一强密钥和唯一强密码。

## 初始化管理员

管理员账号由脚本创建：

```bash
npm run admin:init
```

初始化前请在 `.env` 中设置：

```bash
DEFAULT_ADMIN_USERNAME=你的管理员用户名
DEFAULT_ADMIN_PASSWORD=你的管理员强密码
```

如果管理员账号已经存在，初始化脚本只会确认账号为管理员且处于启用状态，不会重置已有密码。需要主动重置时再执行：

```bash
CHENDOC_RESET_ADMIN_PASSWORD=1 npm run admin:init
```

## 部署

服务器部署推荐使用仓库内脚本：

```bash
bash ./deploy.sh
```

首次部署并初始化管理员：

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

脚本会执行依赖安装、构建、数据库迁移，并启动服务。部署完成后把 Nginx 或宝塔反向代理指向：

```text
http://127.0.0.1:8985
```

## R2 配置

可以在后台 `系统设置 -> R2 设置` 中填写和测试对象存储配置。也可以使用环境变量或导入脚本维护配置。

上传链路依赖 R2 配置完整可用。修改 R2 密钥后建议在后台先执行连接测试和上传测试。

## 常用命令

```bash
npm run dev              # 本地开发
npm run build            # 构建前端和后端
npm run test             # 运行后端测试
npm run db:migrate       # 数据库迁移
npm run admin:init       # 初始化或修复管理员账号
npm run r2:import        # 导入 R2 配置
npm run db:backup        # 备份 SQLite 数据库
```

## 目录说明

```text
apps/admin/              Vue 管理后台
server/                  Fastify 后端和数据库模块
scripts/                 构建、部署、备份脚本
docs/                    项目说明文档
data/                    运行数据和 SQLite 数据库，不提交
server/public/admin/     构建后由后端托管的前端产物
```

更详细的文件地图见 `FILE_GUIDE.md`。

## 安全提示

- 不要公开 `.env`、数据库、日志和部署机密钥。
- 首次部署后请确认管理员密码、JWT 密钥、配置加密密钥、RSA 私钥加密密钥均已替换。
- R2 Access Key / Secret 只保存在服务端配置中，前端不会直接暴露密钥。
- 公开分享权限和分享审核逻辑建议在上线前跑一遍测试。

## 开源地址

[https://github.com/cxiao4128/chendoc](https://github.com/cxiao4128/chendoc)
