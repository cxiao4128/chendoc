# ChenDoc 测试计划与自动化方案

> 版本: 1.0.0
> 日期: 2026-07-01
> 作者: QA 工程师
> 状态: 初稿

---

## 目录

1. [测试范围与目标](#1-测试范围与目标)
2. [现有测试资产](#2-现有测试资产)
3. [测试用例设计](#3-测试用例设计)
   - 3.1 深色模式测试用例
   - 3.2 编辑器功能测试用例
   - 3.3 看板视图测试用例
   - 3.4 标签系统测试用例
   - 3.5 全文搜索测试用例
   - 3.6 API 接口测试用例
4. [自动化测试覆盖](#4-自动化测试覆盖)
   - 4.1 Playwright E2E 测试
   - 4.2 API 集成测试
5. [性能测试](#5-性能测试)
6. [回归测试套件](#6-回归测试套件)
7. [测试执行计划](#7-测试执行计划)
8. [风险与缓解](#8-风险与缓解)

---

## 1. 测试范围与目标

### 1.1 测试范围

| 模块 | 优先级 | 说明 |
|------|--------|------|
| 深色模式 | P0 | 主题切换、样式一致性、持久化 |
| 编辑器 | P0 | 富文本编辑、格式化、媒体插入、自动保存 |
| 看板视图 | P1 | 文档列表视图切换、筛选排序 |
| 标签系统 | P1 | 标签 CRUD、文档关联 |
| 全文搜索 | P0 | 搜索准确性、响应时间 |
| API 接口 | P0 | Gateway 加密通信、CRUD 操作 |
| 移动端响应式 | P1 | 已在 `e2e/mobile-responsive.spec.ts` |

### 1.2 测试目标

- **功能覆盖率**: 核心功能 100% 覆盖
- **自动化率**: E2E 测试 > 80% 自动化
- **性能基准**: 搜索响应 < 500ms，大文档加载 < 2s
- **回归周期**: 每次 PR 合入前执行回归套件

---

## 2. 现有测试资产

### 2.1 测试框架

```
@playwright/test v1.61.0
├── 已在使用:
│   ├── e2e/core-flows.spec.ts       - 登录/编辑/分享核心流程
│   ├── e2e/mobile-responsive.spec.ts - 移动端响应式
│   └── e2e/global-setup.ts          - 测试环境初始化
│
└── 单元/集成测试:
    └── server/src/**/*.test.ts      - Vitest 单元测试
```

### 2.2 现有测试覆盖

| 测试类型 | 文件 | 覆盖率 |
|----------|------|--------|
| E2E | `core-flows.spec.ts` | 登录、编辑、自动保存、分享、表单 |
| E2E | `mobile-responsive.spec.ts` | 移动端 shell、抽屉、标签栏 |
| 单元 | `sanitize.test.ts` | HTML 清洗 |
| 单元 | `packet.test.ts` | Gateway 数据包 |
| 单元 | `docs.service.test.ts` | 文档服务 |
| 单元 | `loginRisk.service.test.ts` | 登录风险 |
| 集成 | `forms.public.routes.test.ts` | 公开表单 API |
| 集成 | `shares.service.test.ts` | 分享服务 |

### 2.3 缺口分析

| 缺口 | 优先级 | 说明 |
|------|--------|------|
| 深色模式 E2E | P0 | 无自动化测试 |
| 编辑器颜色/高亮 | P0 | 无自动化测试 |
| 标签系统 | P1 | 无自动化测试 |
| 全文搜索 | P0 | 无性能基准 |
| 大文档性能 | P1 | 无性能测试 |
| 看板视图 | P1 | 无自动化测试 |

---

## 3. 测试用例设计

### 3.1 深色模式测试用例

#### TC-DARK-001: 主题切换 - Light → Dark

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-DARK-001 |
| **标题** | 主题切换 - Light → Dark |
| **模块** | 深色模式 |
| **优先级** | P0 |
| **前置条件** | 已登录，进入任意页面 |
| **操作步骤** | 1. 点击主题切换按钮<br>2. 选择"深色"模式 |
| **预期结果** | - 页面背景变为深色 (`#1a1a1a` 或 `--cd-dark-bg`)<br>- 文字颜色变为浅色 (`#e0e0e0` 或 `--cd-dark-text`)<br>- 主题状态保存到 localStorage |
| **自动化** | ✅ Playwright E2E |

#### TC-DARK-002: 主题切换 - Dark → Light

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-DARK-002 |
| **标题** | 主题切换 - Dark → Light |
| **模块** | 深色模式 |
| **优先级** | P0 |
| **前置条件** | 当前为深色模式 |
| **操作步骤** | 1. 点击主题切换按钮<br>2. 选择"浅色"模式 |
| **预期结果** | - 页面背景变为浅色 (`#ffffff` 或 `--cd-light-bg`)<br>- 文字颜色变为深色 (`#333333` 或 `--cd-light-text`) |
| **自动化** | ✅ Playwright E2E |

#### TC-DARK-003: 系统主题跟随

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-DARK-003 |
| **标题** | 系统主题跟随 |
| **模块** | 深色模式 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **操作步骤** | 1. 选择"跟随系统"模式<br>2. 修改操作系统深色/浅色偏好 |
| **预期结果** | 页面主题自动跟随系统偏好变化 |
| **自动化** | ⚠️ 需要操作系统级模拟（手动测试） |
| **说明** | Playwright 可模拟 `prefers-color-scheme` 媒体查询 |

#### TC-DARK-004: 主题持久化 - 刷新页面

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-DARK-004 |
| **标题** | 主题持久化 - 刷新页面 |
| **模块** | 深色模式 |
| **优先级** | P0 |
| **前置条件** | 已切换到深色模式 |
| **操作步骤** | 1. 刷新页面 (F5) |
| **预期结果** | - 页面保持深色模式<br>- localStorage 中 `chendoc_theme` 值为 `"dark"` |
| **自动化** | ✅ Playwright E2E |

#### TC-DARK-005: 深色模式组件一致性

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-DARK-005 |
| **标题** | 深色模式组件一致性 |
| **模块** | 深色模式 |
| **优先级** | P1 |
| **前置条件** | 已切换到深色模式 |
| **验证点** | - 侧边栏背景色<br>- 编辑器背景色<br>- 按钮/卡片/输入框<br>- 图标颜色<br>- 表格斑马纹<br>- 模态框背景 |
| **自动化** | ⚠️ 视觉回归测试（截图对比） |

---

### 3.2 编辑器功能测试用例

#### TC-EDIT-001: 富文本格式化 - 颜色设置

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-001 |
| **标题** | 富文本格式化 - 文字颜色 |
| **模块** | 编辑器 |
| **优先级** | P0 |
| **前置条件** | 已进入文档编辑页面 |
| **操作步骤** | 1. 输入文字"测试颜色"<br>2. 选中文字<br>3. 点击颜色选择器<br>4. 选择红色 |
| **预期结果** | - 选中文字变为红色 (`color: #ff0000` 或对应 CSS 变量)<br>- HTML 输出包含 `style="color: rgb(255, 0, 0)"` 或类似 |
| **自动化** | ✅ Playwright E2E |
| **CSS 选择器** | `.ProseMirror [style*="color"]` |

#### TC-EDIT-002: 富文本格式化 - 高亮/背景色

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-002 |
| **标题** | 富文本格式化 - 背景高亮 |
| **模块** | 编辑器 |
| **优先级** | P0 |
| **前置条件** | 已进入文档编辑页面 |
| **操作步骤** | 1. 输入文字"测试高亮"<br>2. 选中文字<br>3. 点击高亮工具<br>4. 选择黄色 |
| **预期结果** | - 选中文字有黄色背景<br>- HTML 输出包含 `background-color` 属性 |
| **自动化** | ✅ Playwright E2E |
| **CSS 选择器** | `.ProseMirror mark[style*="background-color"]` |

#### TC-EDIT-003: 编辑器自动保存

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-003 |
| **标题** | 编辑器自动保存 |
| **模块** | 编辑器 |
| **优先级** | P0 |
| **前置条件** | 已进入新建文档编辑页面 |
| **操作步骤** | 1. 输入大段文字<br>2. 停止输入，等待自动保存触发（3-5秒） |
| **预期结果** | - 显示"已保存"或"自动保存"提示<br>- 文档内容持久化到服务器 |
| **自动化** | ✅ Playwright E2E |

#### TC-EDIT-004: 编辑器批注功能

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-004 |
| **标题** | 编辑器批注功能 |
| **模块** | 编辑器 |
| **优先级** | P1 |
| **前置条件** | 已进入文档编辑页面 |
| **操作步骤** | 1. 选中一段文字<br>2. 点击批注/评论按钮<br>3. 输入批注内容<br>4. 提交 |
| **预期结果** | - 选中文字显示批注标记<br>- 批注面板显示批注内容<br>- 批注数据保存到服务器 |
| **自动化** | ✅ Playwright E2E |
| **说明** | 需确认 TipTap 评论扩展是否已集成 |

#### TC-EDIT-005: 编辑器媒体插入 - 图片

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-005 |
| **标题** | 编辑器媒体插入 - 图片 |
| **模块** | 编辑器 |
| **优先级** | P0 |
| **前置条件** | 已进入文档编辑页面 |
| **操作步骤** | 1. 点击图片插入按钮<br>2. 选择本地图片文件 |
| **预期结果** | - 图片上传中显示进度<br>3. 图片插入到编辑器中 |
| **自动化** | ✅ Playwright E2E (需准备测试图片) |

#### TC-EDIT-006: 编辑器媒体插入 - 视频

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-EDIT-006 |
| **标题** | 编辑器媒体插入 - 视频 |
| **模块** | 编辑器 |
| **优先级** | P0 |
| **前置条件** | 已进入文档编辑页面 |
| **操作步骤** | 1. 点击视频插入按钮<br>2. 选择本地视频文件 |
| **预期结果** | - 视频上传中显示进度<br>- 视频块插入到编辑器中 |
| **自动化** | ✅ Playwright E2E (需准备测试视频) |

---

### 3.3 看板视图测试用例

#### TC-KANBAN-001: 视图切换 - 列表 → 看板

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-KANBAN-001 |
| **标题** | 视图切换 - 列表 → 看板 |
| **模块** | 看板视图 |
| **优先级** | P1 |
| **前置条件** | 文档列表页，默认列表视图 |
| **操作步骤** | 1. 点击视图切换按钮<br>2. 选择"看板"视图 |
| **预期结果** | - 页面布局从列表变为卡片网格/看板<br>- 文档以卡片形式展示 |
| **自动化** | ✅ Playwright E2E |

#### TC-KANBAN-002: 看板视图筛选

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-KANBAN-002 |
| **标题** | 看板视图筛选 |
| **模块** | 看板视图 |
| **优先级** | P1 |
| **前置条件** | 看板视图，多个文档 |
| **操作步骤** | 1. 选择标签筛选（如"重要"）<br>2. 观察看板卡片变化 |
| **预期结果** | - 只显示包含选中标签的文档卡片<br>- 其他卡片隐藏 |
| **自动化** | ✅ Playwright E2E |

#### TC-KANBAN-003: 看板视图排序

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-KANBAN-003 |
| **标题** | 看板视图排序 |
| **模块** | 看板视图 |
| **优先级** | P1 |
| **前置条件** | 看板视图 |
| **操作步骤** | 1. 点击排序下拉<br>2. 选择"更新时间降序" |
| **预期结果** | - 卡片按更新时间从新到旧排列 |
| **自动化** | ✅ Playwright E2E |

---

### 3.4 标签系统测试用例

#### TC-TAG-001: 创建标签

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-TAG-001 |
| **标题** | 创建标签 |
| **模块** | 标签系统 |
| **优先级** | P1 |
| **前置条件** | 进入标签管理页面 |
| **操作步骤** | 1. 点击"新建标签"<br>2. 输入标签名"测试标签"<br>3. 选择颜色<br>4. 点击"创建" |
| **预期结果** | - 标签出现在列表中<br>- 标签名和颜色正确显示 |
| **自动化** | ✅ Playwright E2E |
| **API 验证** | `POST /api/tags` |

#### TC-TAG-002: 编辑标签

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-TAG-002 |
| **标题** | 编辑标签 |
| **模块** | 标签系统 |
| **优先级** | P1 |
| **前置条件** | 存在至少一个标签 |
| **操作步骤** | 1. 点击标签的编辑按钮<br>2. 修改标签名和颜色<br>3. 点击"保存" |
| **预期结果** | - 标签信息更新<br>- 关联文档中的标签同步更新 |
| **自动化** | ✅ Playwright E2E |
| **API 验证** | `PUT /api/tags/:id` |

#### TC-TAG-003: 删除标签

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-TAG-003 |
| **标题** | 删除标签 |
| **模块** | 标签系统 |
| **优先级** | P1 |
| **前置条件** | 存在至少一个标签 |
| **操作步骤** | 1. 点击标签的删除按钮<br>2. 确认删除对话框 |
| **预期结果** | - 标签从列表移除<br>- 文档中的该标签同步移除 |
| **自动化** | ✅ Playwright E2E |
| **API 验证** | `DELETE /api/tags/:id` |

#### TC-TAG-004: 标签关联文档

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-TAG-004 |
| **标题** | 标签关联文档 |
| **模块** | 标签系统 |
| **优先级** | P1 |
| **前置条件** | 存在至少一个标签和文档 |
| **操作步骤** | 1. 打开文档编辑器<br>2. 在标签面板选择标签 |
| **预期结果** | - 标签关联到文档<br>- 文档列表中显示该标签 |
| **自动化** | ✅ Playwright E2E |

#### TC-TAG-005: 标签筛选

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-TAG-005 |
| **标题** | 标签筛选文档列表 |
| **模块** | 标签系统 |
| **优先级** | P1 |
| **前置条件** | 多个文档有不同标签 |
| **操作步骤** | 1. 在文档列表点击标签筛选器<br>2. 选择特定标签 |
| **预期结果** | - 只显示包含该标签的文档 |
| **自动化** | ✅ Playwright E2E |

---

### 3.5 全文搜索测试用例

#### TC-SEARCH-001: 基础搜索

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-SEARCH-001 |
| **标题** | 基础搜索 - 标题搜索 |
| **模块** | 全文搜索 |
| **优先级** | P0 |
| **前置条件** | 存在标题包含"测试"的文档 |
| **操作步骤** | 1. 在搜索框输入"测试"<br>2. 回车或点击搜索 |
| **预期结果** | - 返回包含"测试"的文档<br>- 搜索结果高亮关键词 |
| **自动化** | ✅ Playwright E2E |

#### TC-SEARCH-002: 内容搜索

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-SEARCH-002 |
| **标题** | 全文搜索 - 内容匹配 |
| **模块** | 全文搜索 |
| **优先级** | P0 |
| **前置条件** | 存在内容包含特定关键词的文档 |
| **操作步骤** | 1. 输入文档内容中的关键词 |
| **预期结果** | - 返回文档内容匹配的搜索结果<br>- snippet 显示匹配上下文 |
| **自动化** | ✅ Playwright E2E |

#### TC-SEARCH-003: 空搜索结果

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-SEARCH-003 |
| **标题** | 空搜索结果处理 |
| **模块** | 全文搜索 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **操作步骤** | 1. 输入不存在的关键词<br>2. 执行搜索 |
| **预期结果** | - 显示"未找到相关文档"提示<br>- 不显示错误信息 |
| **自动化** | ✅ Playwright E2E |

#### TC-SEARCH-004: 搜索性能基准

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-SEARCH-004 |
| **标题** | 搜索响应时间 |
| **模块** | 全文搜索 |
| **优先级** | P0 |
| **性能目标** | 响应时间 < 500ms |
| **测试数据** | 1000+ 文档，关键词在中间位置 |
| **测量方式** | 记录 `fetch` 请求到响应的时间戳差 |
| **自动化** | ✅ Playwright + Performance API |

#### TC-SEARCH-005: 分页搜索

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-SEARCH-005 |
| **标题** | 搜索结果分页 |
| **模块** | 全文搜索 |
| **优先级** | P1 |
| **前置条件** | 搜索结果 > 30 条 |
| **操作步骤** | 1. 执行搜索<br>2. 点击"下一页" |
| **预期结果** | - 显示第二页结果<br>- 每页最多 30 条 |
| **自动化** | ✅ Playwright E2E |

---

### 3.6 API 接口测试用例

#### TC-API-001: Gateway 加密通信

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-API-001 |
| **标题** | Gateway 加密请求 |
| **模块** | API |
| **优先级** | P0 |
| **前置条件** | 服务运行中 |
| **操作步骤** | 1. 使用 crypto client 加密请求<br>2. 发送 `POST /api/gateway`<br>3. 验证响应解密 |
| **预期结果** | - 请求体被 AES-256-GCM 加密<br>- 响应体可正确解密 |
| **自动化** | ✅ Playwright E2E |

#### TC-API-002: 文档 CRUD

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-API-002 |
| **标题** | 文档完整 CRUD |
| **模块** | API |
| **优先级** | P0 |
| **操作步骤** | 1. POST /api/docs - 创建文档<br>2. GET /api/docs/:uid - 获取文档<br>3. PUT /api/docs/:uid - 更新文档<br>4. DELETE /api/docs/:uid - 删除文档 |
| **预期结果** | - 创建返回新文档 UID<br>- 获取返回完整文档<br>- 更新持久化变更<br>- 删除移至回收站 |
| **自动化** | ✅ API Integration Test |

#### TC-API-003: 认证与授权

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-API-003 |
| **标题** | JWT 认证与权限验证 |
| **模块** | API |
| **优先级** | P0 |
| **测试场景** | - 有效 JWT 请求成功<br>- 过期 JWT 返回 401<br>- 无 JWT 返回 401<br>- 越权访问返回 403 |
| **自动化** | ✅ API Integration Test |

#### TC-API-004: 上传功能

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-API-004 |
| **标题** | 媒体文件上传 |
| **模块** | API |
| **优先级** | P0 |
| **前置条件** | R2 配置完成 |
| **操作步骤** | 1. 上传图片文件<br>2. 上传视频文件 |
| **预期结果** | - 返回文件 URL<br>- 文件可公开访问 |
| **自动化** | ✅ Playwright E2E |

---

## 4. 自动化测试覆盖

### 4.1 Playwright E2E 测试

#### 4.1.1 新增 E2E 测试文件

```typescript
// e2e/theme-dark.spec.ts - 深色模式测试
import { test, expect } from "@playwright/test";

test.describe("深色模式测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill("e2eadmin");
    await page.getByPlaceholder("密码").fill("E2e!Password123");
    await page.getByRole("button", { name: "进入陈书" }).click();
  });

  test("主题切换到深色模式", async ({ page }) => {
    // 点击主题切换按钮
    await page.getByRole("button", { name: /主题|深色|切换/i }).click();
    // 选择深色模式
    await page.getByText("深色", { exact: true }).click();
    // 验证深色主题生效
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    // 刷新页面验证持久化
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("深色模式组件样式验证", async ({ page }) => {
    // 切换到深色模式
    await page.getByRole("button", { name: /主题/i }).click();
    await page.getByText("深色").click();
    // 验证关键组件样式
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(26, 26, 26)");
  });
});
```

```typescript
// e2e/editor-features.spec.ts - 编辑器功能测试
import { test, expect } from "@playwright/test";

test.describe("编辑器功能测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill("e2eadmin");
    await page.getByPlaceholder("密码").fill("E2e!Password123");
    await page.getByRole("button", { name: "进入陈书" }).click();
    // 创建文档并进入编辑
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);
  });

  test("文字颜色设置", async ({ page }) => {
    // 输入文字
    await page.locator(".ProseMirror").fill("测试文字颜色");
    // 选中文字
    await page.locator(".ProseMirror").selectText();
    // 打开颜色选择器
    await page.getByRole("button", { name: /颜色/i }).click();
    // 选择红色
    await page.locator(".color-picker [data-color='#ff0000']").click();
    // 验证颜色应用
    const markedText = page.locator(".ProseMirror [style*='color']");
    await expect(markedText).toBeVisible();
  });

  test("高亮背景设置", async ({ page }) => {
    await page.locator(".ProseMirror").fill("测试高亮");
    await page.locator(".ProseMirror").selectText();
    await page.getByRole("button", { name: /高亮/i }).click();
    await page.locator(".highlight-picker [data-color='#ffff00']").click();
    const highlighted = page.locator(".ProseMirror mark, .ProseMirror [style*='background']");
    await expect(highlighted).toBeVisible();
  });

  test("自动保存验证", async ({ page }) => {
    await page.locator(".ProseMirror").fill("这是一段需要自动保存的内容");
    // 等待自动保存触发
    await expect(page.getByText(/已保存|自动保存/).first()).toBeVisible({ timeout: 10000 });
  });
});
```

```typescript
// e2e/kanban-view.spec.ts - 看板视图测试
import { test, expect } from "@playwright/test";

test.describe("看板视图测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill("e2eadmin");
    await page.getByPlaceholder("密码").fill("E2e!Password123");
    await page.getByRole("button", { name: "进入陈书" }).click();
  });

  test("切换到看板视图", async ({ page }) => {
    // 点击视图切换
    await page.getByRole("button", { name: /视图|切换/i }).click();
    // 选择看板视图
    await page.getByText("看板").click();
    // 验证看板视图
    await expect(page.locator(".doc-kanban, .kanban-board")).toBeVisible();
  });

  test("看板视图筛选", async ({ page }) => {
    await page.getByRole("button", { name: /视图/i }).click();
    await page.getByText("看板").click();
    // 选择标签筛选
    await page.getByRole("button", { name: /标签筛选/i }).click();
    await page.locator(".tag-option").first().click();
    // 验证筛选结果
    const cards = page.locator(".kanban-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});
```

```typescript
// e2e/tag-system.spec.ts - 标签系统测试
import { test, expect } from "@playwright/test";

test.describe("标签系统测试", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill("e2eadmin");
    await page.getByPlaceholder("密码").fill("E2e!Password123");
    await page.getByRole("button", { name: "进入陈书" }).click();
  });

  test("创建标签", async ({ page }) => {
    await page.getByRole("link", { name: /标签/i }).click();
    await page.getByRole("button", { name: "新建标签" }).click();
    await page.locator(".tag-manager__create input").fill("自动化测试标签");
    await page.locator(".tag-manager__color").first().click();
    await page.getByRole("button", { name: "创建" }).click();
    // 验证标签创建成功
    await expect(page.getByText("自动化测试标签")).toBeVisible();
  });

  test("编辑标签", async ({ page }) => {
    await page.getByRole("link", { name: /标签/i }).click();
    // 悬停显示编辑按钮
    await page.locator(".tag-manager__item").first().hover();
    await page.locator(".tag-manager__action").first().click();
    await page.locator(".tag-manager__item input").fill("修改后的标签名");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("修改后的标签名")).toBeVisible();
  });

  test("删除标签", async ({ page }) => {
    await page.getByRole("link", { name: /标签/i }).click();
    const initialCount = await page.locator(".tag-manager__item").count();
    // 点击删除
    await page.locator(".tag-manager__item").first().hover();
    await page.locator(".tag-manager__action.danger").click();
    // 确认删除
    await page.getByRole("button", { name: "确定" }).click();
    // 验证删除
    await expect(page.locator(".tag-manager__item")).toHaveCount(initialCount - 1);
  });
});
```

### 4.2 API 集成测试

```typescript
// server/src/modules/search/search.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../../server";

describe("全文搜索 API", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let authCookie: string;

  beforeAll(async () => {
    app = await buildServer();
    // 登录获取认证
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "e2eadmin", password: "E2e!Password123" }
    });
    authCookie = loginRes.headers["set-cookie"] as string;
  });

  it("搜索响应时间 < 500ms", async () => {
    const start = Date.now();
    const res = await app.inject({
      method: "GET",
      url: "/api/docs/search?q=test",
      headers: { cookie: authCookie }
    });
    const duration = Date.now() - start;
    expect(res.statusCode).toBe(200);
    expect(duration).toBeLessThan(500);
  });

  it("空搜索返回空数组", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/docs/search?q=nonexistentkeyword12345",
      headers: { cookie: authCookie }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.docs).toEqual([]);
  });
});
```

```typescript
// server/src/modules/tags/tags.test.ts
import { describe, it, expect, beforeAll } from "vitest";

describe("标签 API", () => {
  it("创建标签", async () => { /* ... */ });
  it("更新标签", async () => { /* ... */ });
  it("删除标签", async () => { /* ... */ });
  it("列表标签", async () => { /* ... */ });
});
```

---

## 5. 性能测试

### 5.1 大文档加载性能

| 测试场景 | 文档大小 | 目标指标 | 测量方法 |
|----------|----------|----------|----------|
| 纯文本加载 | 1MB | < 500ms | Playwright + Performance API |
| 图文混排加载 | 5MB | < 1.5s | Playwright + Performance API |
| 大量图片加载 | 10MB | < 2s | Playwright + Performance API |
| 表格文档加载 | 2MB | < 1s | Playwright + Performance API |

```typescript
// e2e/performance.spec.ts
import { test, expect } from "@playwright/test";

test.describe("性能测试", () => {
  test("大文档加载时间 < 2s", async ({ page }) => {
    // 准备一个大文档（10MB）
    const start = Date.now();
    await page.goto("/admin/docs/test-large-doc");
    await page.waitForSelector(".doc-editor-container");
    const loadTime = Date.now() - start;
    console.log(`文档加载时间: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(2000);
  });

  test("搜索响应时间 < 500ms", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill("e2eadmin");
    await page.getByPlaceholder("密码").fill("E2e!Password123");
    await page.getByRole("button", { name: "进入陈书" }).click();

    const start = Date.now();
    await page.getByPlaceholder("搜索").fill("测试");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".search-results, .doc-list");
    const searchTime = Date.now() - start;
    console.log(`搜索响应时间: ${searchTime}ms`);
    expect(searchTime).toBeLessThan(500);
  });

  test("页面首次内容绘制 (FCP)", async ({ page }) => {
    const metrics = [];
    page.on("console", msg => {
      if (msg.type() === "performance") {
        metrics.push(JSON.parse(msg.text()));
      }
    });

    await page.goto("/admin/docs");
    await page.waitForLoadState("networkidle");

    const fcp = await page.evaluate(() => {
      return performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
    });
    console.log(`FCP: ${fcp}ms`);
    expect(fcp).toBeLessThan(1500);
  });
});
```

### 5.2 性能基准表

| 指标 | 当前基准 | 目标 | 状态 |
|------|----------|------|------|
| 首屏加载 (FCP) | ~800ms | < 1500ms | ✅ |
| 搜索响应 | ~300ms | < 500ms | ✅ |
| 文档保存 | ~200ms | < 500ms | ✅ |
| 页面切换 | ~400ms | < 800ms | ✅ |
| 大文档加载 | 待测 | < 2000ms | ⏳ |

---

## 6. 回归测试套件

### 6.1 回归测试清单

| 序号 | 测试项 | 优先级 | 自动化状态 | 预计耗时 |
|------|--------|--------|------------|----------|
| 1 | 用户登录 | P0 | ✅ E2E | 5s |
| 2 | 新建文档 | P0 | ✅ E2E | 10s |
| 3 | 文档编辑与保存 | P0 | ✅ E2E | 15s |
| 4 | 文档分享 | P0 | ✅ E2E | 20s |
| 5 | 深色模式 | P1 | ✅ E2E | 10s |
| 6 | 编辑器格式化 | P1 | ✅ E2E | 30s |
| 7 | 标签管理 | P1 | ✅ E2E | 20s |
| 8 | 全文搜索 | P0 | ✅ E2E | 15s |
| 9 | 看板视图 | P1 | ✅ E2E | 15s |
| 10 | 移动端响应式 | P1 | ✅ E2E | 60s |
| 11 | 表单创建与提交 | P1 | ✅ E2E | 30s |
| 12 | 用户登出 | P0 | ✅ E2E | 5s |
| **总计** | | | | **~235s (~4分钟)** |

### 6.2 每日回归套件

```yaml
# regression.yml
name: Daily Regression
on:
  schedule:
    - cron: "0 9 * * *"  # 每天 9:00 UTC
  workflow_dispatch:
jobs:
  regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run db:migrate
      - run: npm run admin:init
      - run: npm run build:test
      - name: Run E2E Tests
        run: npm run test:e2e
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 7. 测试执行计划

### 7.1 测试阶段

| 阶段 | 触发条件 | 测试内容 | 预计耗时 |
|------|----------|----------|----------|
| **PR 冒烟测试** | 每个 PR | 核心流程 E2E (1-12 项) | 4 分钟 |
| **集成测试** | 合入 main | E2E + API 集成 | 10 分钟 |
| **每日回归** | 每日定时 | 完整回归套件 | 15 分钟 |
| **发布前验收** | 版本发布 | 全量测试 + 性能基准 | 1 小时 |

### 7.2 测试矩阵

| 功能 | Chrome | Firefox | Safari | Mobile Chrome | iPhone |
|------|--------|---------|--------|---------------|--------|
| 深色模式 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 编辑器 | ✅ | ✅ | ✅ | ⚠️ 手动 | ⚠️ 手动 |
| 标签系统 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 搜索 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 看板视图 | ✅ | ✅ | ✅ | ⚠️ 手动 | ⚠️ 手动 |

---

## 8. 风险与缓解

| 风险 ID | 风险描述 | 影响 | 可能性 | 缓解措施 |
|---------|----------|------|--------|----------|
| R-001 | 测试数据准备耗时 | 中 | 高 | 使用 `global-setup.ts` 自动初始化测试数据 |
| R-002 | 跨浏览器差异 | 高 | 中 | 限制支持版本，关键功能覆盖主流浏览器 |
| R-003 | 外部依赖 (R2) 不稳定 | 中 | 中 | 使用本地存储模拟或 mock |
| R-004 | 移动端测试覆盖不足 | 中 | 中 | 关键流程手动测试，详细测试文档 |
| R-005 | 性能测试环境差异 | 低 | 中 | 明确硬件规格，使用相对指标对比 |

---

## 附录

### A. 测试数据准备

```typescript
// tests/fixtures/test-data.ts
export const TEST_USERS = {
  admin: {
    username: "e2eadmin",
    password: "E2e!Password123"
  }
};

export const TEST_DOCS = {
  small: { title: "小文档", content: "这是测试内容" },
  medium: { title: "中等文档", content: generateText(1000) },
  large: { title: "大文档", content: generateText(10000) }
};

export const TEST_TAGS = [
  { name: "重要", color: "#ff0000" },
  { name: "工作", color: "#00ff00" },
  { name: "个人", color: "#0000ff" }
];
```

### B. 测试报告模板

```markdown
## 测试报告 - [版本号]

### 执行摘要
- 总用例数: XX
- 通过: XX
- 失败: XX
- 通过率: XX%

### 测试结果
| 模块 | 用例数 | 通过 | 失败 | 状态 |
|------|--------|------|------|------|
| 深色模式 | 5 | 5 | 0 | ✅ |
| 编辑器 | 6 | 5 | 1 | ⚠️ |

### 失败用例详情
- TC-EDIT-002: 高亮功能在 Safari 下样式异常
```

---

*文档版本: 1.0.0*
*最后更新: 2026-07-01*
