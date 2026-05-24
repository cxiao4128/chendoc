# 更新日志 / Changelog

语言 / Language: [中文](#中文) | [English](#english)

## 中文

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
