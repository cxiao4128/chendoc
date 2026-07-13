# ChenDoc 前端静态剥离与 Cloudflare Pages 自动部署

固定架构：

```text
https://d.w92.pw       -> Cloudflare Pages：全部 Vue SPA 页面
https://api.w92.pw     -> 原服务器：全部动态 API
Cloudflare R2          -> 图片、视频和附件
MySQL                  -> 原服务器数据库
```

`d.w92.pw` 包含 `/login`、`/register`、`/admin`、`/users`、`/r/*`、`/f/*` 等全部展示页面。浏览器需要动态数据时，直接跨源请求 `api.w92.pw`。

Pages 产物只有 HTML、CSS、JavaScript、字体、图标和普通静态图片。不包含 Worker 代理、数据库、JWT、R2 密钥或任何服务端加密密钥。

## 一、首次连接 GitHub

推荐使用 Cloudflare Pages Git Integration。连接一次后，GitHub `main` 每次 push 都会自动触发构建和生产部署，不再手动上传 ZIP。

> 如果现有 Pages 项目是 Direct Upload，Cloudflare 不支持把它原地转换成 Git Integration。新建一个 Git 集成项目；验证其 `pages.dev` 地址后，再把 `d.w92.pw` 从旧项目移到新项目。

1. 确认代码已推送到 GitHub 仓库 `cxiao4128/chendoc` 的 `main` 分支。
2. 打开 Cloudflare Dashboard -> `Workers & Pages` -> `Create application` -> `Pages` -> `Connect to Git`。
3. 授权 GitHub，只选择 `cxiao4128/chendoc` 即可。
4. 使用以下构建配置：

```text
Project name: chendoc-git
Production branch: main
Framework preset: None
Root directory: 留空（仓库根目录）
Build command: npm run build:cloudflare-pages
Build output directory: apps/admin/dist
Build system version: 3
```

5. 在 `Environment variables` 中同时为 Production 和 Preview 配置：

```text
CHENDOC_CLOUDFLARE_BACKEND_ORIGIN=https://api.w92.pw
CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN=https://d.w92.pw
```

项目根目录的 `.node-version` 已固定 Cloudflare 当前 v3 构建镜像支持的 Node.js `22.16.0`。不要把服务器 `.env` 或任何密钥添加到 Pages。

6. 保存并执行第一次部署。构建脚本会自动：

- 构建 `apps/admin/dist`。
- 写入指向 `https://api.w92.pw` 的运行时 API 配置。
- 写入固定展示域名 `https://d.w92.pw`。
- 生成 `_headers` 安全头与 CSP。
- 生成 `_redirects` SPA 深层路由回退。
- 拒绝示例域名、HTTP 来源、source map、Worker 和源码目录进入产物。

在 `Builds & deployments` 中保持 Production automatic deployments 开启；Preview branch 设为 `None`。预览域名不是 `d.w92.pw`，后端精确 CORS 默认不会允许它。Build watch paths 先保留默认 Include `*`、Exclude 空。

## 二、以后自动更新

以后只需把更新推送或合并到 GitHub `main`：

```bash
git push origin main
```

Cloudflare 会自动拉取该提交，执行 `npm run build:cloudflare-pages`，再把 `apps/admin/dist` 发布为生产部署。Dashboard 的 `Deployments` 页面可查看构建日志、提交 SHA 和部署状态。

本地复现 Cloudflare 构建：

```bash
CHENDOC_CLOUDFLARE_BACKEND_ORIGIN=https://api.w92.pw \
CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN=https://d.w92.pw \
npm run build:cloudflare-pages
```

PowerShell：

```powershell
$env:CHENDOC_CLOUDFLARE_BACKEND_ORIGIN='https://api.w92.pw'
$env:CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN='https://d.w92.pw'
npm run build:cloudflare-pages
```

不要把 `npm run package:deployments` 填成 Pages 的 Git 构建命令。它生成发布 ZIP，不把可部署目录保留为 Pages 输出。

## 三、启用服务器 API 域名

在 Cloudflare DNS 创建 `api.w92.pw`，指向服务器公网 IP，并开启代理。Nginx 反向代理到：

```text
http://127.0.0.1:8985
```

示例：

```nginx
server {
    listen 443 ssl http2;
    server_name api.w92.pw;

    location / {
        proxy_pass http://127.0.0.1:8985;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

服务器 `.env`：

```env
PUBLIC_SITE_URL=https://d.w92.pw
CHENDOC_API_ORIGIN=https://api.w92.pw
CHENDOC_ADMIN_ORIGINS=https://d.w92.pw
CHENDOC_R2_CORS_ORIGINS=https://d.w92.pw
CHENDOC_SERVE_ADMIN=true
CHENDOC_FORCE_HTTPS=true
CHENDOC_TRUST_PROXY=127.0.0.1
```

要求：

- Origin 必须精确为 `https://d.w92.pw`，不能写 `*`、路径或末尾 `/`。
- `CHENDOC_API_ORIGIN` 防止 API 请求被重定向到前端域名。
- 第一次切换先保留 `CHENDOC_SERVE_ADMIN=true`；Pages 验收完成后改成 `false` 并重启后端。
- 数据库、JWT、配置加密、文档加密、备份加密和 R2 密钥只留服务器。

健康检查：

```bash
curl -i https://api.w92.pw/api/health
```

应返回 `200`，响应体包含：

```json
{"ok":true,"database":"ok"}
```

## 四、验证 API CORS

```bash
curl -i -X OPTIONS 'https://api.w92.pw/api/gateway' \
  -H 'Origin: https://d.w92.pw' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type,x-client-fingerprint,x-client-risk'
```

必须看到：

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://d.w92.pw
Access-Control-Allow-Credentials: true
```

不能返回 `Access-Control-Allow-Origin: *`。

## 五、绑定唯一展示域名

1. 先用新 Git 集成项目的 `pages.dev` 地址验证构建成功。
2. 若 `d.w92.pw` 已绑定旧 Direct Upload 项目，先从旧项目移除。
3. 打开新 Pages 项目 -> `Custom domains` -> `Set up a domain`。
4. 输入 `d.w92.pw`，等待状态变成 `Active`。

必须从 Pages 的 `Custom domains` 页面绑定，不能只手工创建普通 CNAME。

这些地址都由同一个 SPA 返回：

```text
https://d.w92.pw/
https://d.w92.pw/login
https://d.w92.pw/register
https://d.w92.pw/admin
https://d.w92.pw/users
https://d.w92.pw/r/607910
https://d.w92.pw/f/example
```

## 六、配置 R2 CORS

```json
[
  {
    "AllowedOrigins": ["https://d.w92.pw"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

若预签名成功但浏览器 `PUT` 失败，先检查 R2 CORS 的 Origin、Method 和 `Content-Type`。

## 七、上线验收

打开 `https://d.w92.pw/login`，检查：

1. 登录、注册、刷新会话。
2. 新建文档并保存。
3. 上传图片、视频和附件。
4. 开启公开分享后自动生成分享码。
5. 分享链接固定为 `https://d.w92.pw/r/{分享码}`。
6. 刷新 `/r/{分享码}` 和 `/f/{表单码}` 不出现 404。
7. 浏览器网络面板中动态请求发往 `https://api.w92.pw`。
8. Pages 资源中不存在 `.env`、数据库连接串、JWT、R2 Secret 或加密密钥。

全部通过后，将服务器配置改为：

```env
CHENDOC_SERVE_ADMIN=false
```

此时 `api.w92.pw` 只提供 API；`d.w92.pw` 负责所有页面。

## 八、手动发布包与回滚

Git 自动部署是默认方式。ZIP 仅作离线备份或 Direct Upload 兜底：

```bash
npm run package:deployments -- --backend-origin=https://api.w92.pw --public-origin=https://d.w92.pw
```

生成：

```text
release/chendoc-3.3.0-cloudflare-pages.zip
release/chendoc-3.3.0-server.zip
release/chendoc-3.3.0-SHA256SUMS.txt
```

Pages 回滚：在 `Deployments` 中选择上一个成功部署并回滚。服务器回滚：恢复上一个服务器包。临时恢复一体化入口时，设 `CHENDOC_SERVE_ADMIN=true`，再将展示域名切回服务器。

## 官方文档

- [Cloudflare Pages Git Integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [GitHub Integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Direct Upload 与 Git Integration 限制](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages Build Configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Pages Build Image](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Pages Branch Controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Pages Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/)
- [Pages Custom Domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
