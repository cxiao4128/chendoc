# ChenDoc / 陈书

ChenDoc 是适合单机部署的轻量私有文档系统。前端使用 Vue 3 + Vite + TypeScript + Pinia + Vue Router + TipTap，后端使用 Node.js 20+ + Fastify + TypeScript + Drizzle ORM + SQLite。

## 常用命令

```bash
npm install
npm run build
npm run db:migrate
npm run admin:init
npm run r2:import
npm start
```

## 初始化管理员

管理员账号由 `npm run admin:init` 创建。默认用户名是 ``，也可以通过 `.env` 中的 `DEFAULT_ADMIN_USERNAME` 修改。

系统不再提供默认管理员密码。生产环境和执行 `npm run admin:init` 前，必须在 `.env` 中设置 `DEFAULT_ADMIN_PASSWORD`。默认要求至少 12 位、同时包含大小写字母、数字和符号的唯一强密码。
如果必须兼容历史密码，例如 ``，可以显式设置 `CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD=1` 放行旧密码。

如果管理员账号已经存在，`npm run admin:init` 只会确保账号是 `admin` 且处于启用状态，不会重置已有密码。需要明确轮换或重置管理员密码时再执行：

```bash
CHENDOC_RESET_ADMIN_PASSWORD=1 npm run admin:init
```

## 部署提示

`deploy.sh` 默认不会初始化或重置管理员账号。首次部署需要显式启用：

```bash
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

后续重复部署直接运行：

```bash
bash ./deploy.sh
```

如果历史环境曾使用过默认弱密码，请立即轮换管理员密码、`JWT_SECRET`、`CONFIG_ENCRYPTION_KEY`、`RSA_PRIVATE_KEY_ENCRYPTION_KEY` 和 R2 Access Key / Secret。

更多内容见 `docs/部署说明.md`、`docs/R2配置说明.md`、`docs/安全审计.md`、`docs/接口说明.md`。
