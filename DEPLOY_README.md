# ChenDoc 服务器部署

## 上传

把部署包解压到服务器目录，例如：

```bash
mkdir -p /www/wwwroot/chendoc
unzip chendoc-server-deploy-*.zip -d /www/wwwroot/chendoc
cd /www/wwwroot/chendoc
```

## 配置

```bash
cp .env.example .env
nano .env
```

生产环境必须设置：

- `JWT_SECRET`
- `CONFIG_ENCRYPTION_KEY`
- `RSA_PRIVATE_KEY_ENCRYPTION_KEY`
- `DEFAULT_ADMIN_PASSWORD`
- `PUBLIC_SITE_URL`

`DEFAULT_ADMIN_PASSWORD` 不再有代码默认值。默认要求使用唯一强密码：至少 12 位，并同时包含大小写字母、数字和符号。
如果你必须保留历史弱密码，例如 `1314520x`，可以在 `.env` 里显式加入：

```bash
CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD=1
```

这会放行旧密码，但只建议在你明确接受风险时使用。

## 首次部署

`deploy.sh` 默认不会执行管理员初始化，避免重复部署时重置密码。首次部署请显式启用：

```bash
chmod +x deploy.sh start.sh stop.sh
CHENDOC_INIT_ADMIN=1 bash ./deploy.sh
```

如果管理员账号已存在，初始化脚本默认不会改密码，只会确保账号为管理员并处于启用状态。

## 重复部署

```bash
bash ./deploy.sh
```

升级生产库前建议先执行：

```bash
npm run deploy:preflight
npm run db:backup
```

SQLite 备份脚本使用 `VACUUM INTO` 生成一致性副本；不要只复制主 `.sqlite` 文件。

## 明确重置管理员密码

只有在确认需要轮换或重置现有管理员密码时，才启用重置开关：

```bash
CHENDOC_INIT_ADMIN=1 CHENDOC_RESET_ADMIN_PASSWORD=1 bash ./deploy.sh
```

如果线上曾经使用过旧版默认弱密码，请同时轮换管理员密码、JWT secret、配置加密 key、RSA 私钥加密 key 和 R2 Access Key / Secret。

## 常用命令

```bash
bash ./start.sh
bash ./stop.sh
pm2 logs chendoc
pm2 restart chendoc --update-env
```

反向代理目标：

```txt
http://127.0.0.1:8985
```
