# MCP 测试工具集成文档

> 生成时间: 2026-07-01
> 项目: ChenDoc / chensdoc-claude

---

## 1. 现有 Playwright E2E 测试配置

### 1.1 配置文件

**文件**: `playwright.config.ts`

```typescript
import { defineConfig, devices } from "playwright/test";

const port = 8996;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 12"] } },
    { name: "mobile-responsive-390", use: { ...devices["iPhone 12 Pro Max"] } }
  ]
});
```

### 1.2 全局设置

**文件**: `e2e/global-setup.ts`

- 使用 SQLite 数据库 (`.tmp/e2e-chendoc.sqlite`)
- 自动创建测试管理员: `e2eadmin` / `E2e!Password123`
- 启动本地服务器在 `http://127.0.0.1:8996`
- 超时时间: 180 秒

### 1.3 现有测试用例

**文件**: `e2e/core-flows.spec.ts`

| 测试用例 | 描述 |
|---------|------|
| `登录、编辑、自动保存、分享、退出` | 核心用户流程 |
| `公开表单提交` | 表单创建、预览、发布、提交 |

---

## 2. 可用 MCP 工具分析

### 2.1 SpectrAI 内置 MCP 工具

| 工具分类 | 工具名 | 用途 |
|---------|-------|------|
| **团队协作** | `team_complete_task` | 标记任务完成 |
| | `team_report_idle` | 报告空闲状态 |
| | `team_message_role` | 向特定角色发消息 |
| | `team_broadcast` | 向全体广播 |
| | `team_get_tasks` | 查看任务列表 |
| **文件操作** | `spectrai_create_file` | 创建新文件 |
| | `spectrai_write_file` | 写入/覆写文件 |
| | `spectrai_edit_file` | 精确字符串替换 |
| | `spectrai_delete_file` | 删除文件 |
| **技能管理** | `install_skill` | 安装技能 |
| | `search_skills` | 搜索技能 |
| | `invoke_skill` | 执行技能 |

### 2.2 外部 MCP 服务器

| 服务器 | 工具数 | 用途 |
|-------|-------|------|
| `mcp-ssh-deploy` | 9 | SSH 远程部署、文件传输 |
| `mcp-winrm-remote` | 10 | Windows PowerShell 远程操作 |

### 2.3 测试相关 MCP 工具发现

**结论**: 当前 SpectrAI 平台没有专门的测试执行或测试报告生成工具。

**建议方案**:
1. 使用 Playwright 内置报告 (`github`, `html`, `json`)
2. 通过 `spectrai_create_file` / `spectrai_write_file` 将报告写入 `reports/` 目录
3. 使用 `team_message_role` 向团队广播测试结果

---

## 3. 移动端响应式测试方案

### 3.1 目标组件

**文件**: `apps/admin/src/components/layout/MobileAppShell.vue`

组件特性:
- 响应式布局: 移动端专用 shell
- 抽屉导航 (drawer)
- 底部标签栏 (tabbar)
- FAB 按钮
- 编辑路由特殊处理

### 3.2 测试设备配置

| 项目名称 | 设备 | 视口 |
|---------|------|------|
| `chromium` | Desktop Chrome | 1280x720 |
| `mobile-chrome` | Pixel 5 | 393x851 |
| `mobile-safari` | iPhone 12 | 390x844 |
| `mobile-responsive-390` | iPhone 12 Pro Max | 428x926 |

### 3.3 新增测试用例

**文件**: `e2e/mobile-responsive.spec.ts`

| 测试用例 | 描述 |
|---------|------|
| `移动端文档首页 - MobileAppShell 渲染` | 验证 shell 头部、用户信息、标签栏 |
| `移动端抽屉导航 - 打开/关闭` | 验证抽屉交互 |
| `移动端底部标签栏导航` | 验证 5 个标签 |
| `移动端 FAB 按钮可见性` | 验证 FAB 显示 |
| `移动端编辑路由 - 隐藏 shell 组件` | 验证编辑模式布局 |
| `移动端视口切换 - 390px` | 验证 iPhone 12 视口 |
| `移动端视口切换 - 375px` | 验证旧款 iPhone 视口 |
| `移动端表单编辑` | 验证表单在移动端编辑 |
| `移动端 SessionStatusBanner 可见` | 验证状态横幅 |

### 3.4 运行方式

```bash
# 运行所有测试
npm run test:e2e

# 仅运行移动端测试
npm run test:e2e -- mobile-responsive.spec.ts

# 仅运行桌面端测试
npm run test:e2e -- core-flows.spec.ts

# 在 CI 环境运行
CI=1 npm run test:e2e
```

---

## 4. 测试报告集成方案

### 4.1 Playwright 内置报告

| 格式 | 配置 | 输出 |
|------|------|------|
| `list` | 默认 | 控制台输出 |
| `github` | CI=1 | GitHub Actions annotations |
| `html` | 配置 | `playwright-report/` 目录 |
| `json` | 配置 | `playwright-results.json` |

### 4.2 集成 SpectrAI 的方案

#### 方案 A: 测试完成后写入报告文件

```typescript
// e2e/reporter.ts
import { spectrai_write_file } from "@spectrai/mcp-tools";

export async function onTestComplete(test, result) {
  const report = {
    test: test.title,
    status: result.status,
    duration: result.duration,
    errors: result.errors
  };
  await spectrai_write_file({
    file_path: `reports/test-results/${Date.now()}.json`,
    content: JSON.stringify(report, null, 2)
  });
}
```

#### 方案 B: 通过团队消息通知

```typescript
import { team_message_role } from "@spectrai/mcp-tools";

export async function notifyTestResults(summary) {
  await team_message_role({
    targetRole: "leader",
    message: `E2E 测试完成: ${summary.passed}/${summary.total} 通过`
  });
}
```

#### 方案 C: 生成 Markdown 报告

```typescript
import { spectrai_write_file } from "@spectrai/mcp-tools";

export async function generateReport(results) {
  const md = `# E2E 测试报告\n\n## 概要\n- 总数: ${results.total}\n- 通过: ${results.passed}\n- 失败: ${results.failed}\n\n## 详情\n${results.tests.map(t => `- ${t.name}: ${t.status}`).join("\n")}`;
  await spectrai_write_file({
    file_path: `reports/e2e-report-${Date.now()}.md`,
    content: md
  });
}
```

### 4.3 推荐工作流

```
┌─────────────────┐
│  npm run test:e2e  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Playwright 执行  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  生成测试报告    │
│  (HTML/JSON)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ spectrai_write  │
│ file 写入报告   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ team_message    │
│ _role 通知结果  │
└─────────────────┘
```

---

## 5. MCP 工具使用示例

### 5.1 文件操作

```typescript
// 通过 MCP 网关调用
mcp__spectrai-agent__call_mcp_tool({
  server_id: "__builtin__",
  tool_name: "spectrai_create_file",
  arguments: {
    file_path: "d:/desktop/bixu/js/chensdoc-claude/reports/test-report.md",
    content: "# Test Report\n\n..."
  }
});
```

### 5.2 团队通知

```typescript
mcp__spectrai-agent__call_mcp_tool({
  server_id: "__builtin__",
  tool_name: "team_message_role",
  arguments: {
    targetRole: "leader",
    message: "E2E 测试完成: 10/10 通过"
  }
});
```

---

## 6. 下一步建议

1. **安装测试相关 Skill**: 搜索 SpectrAI 是否有测试报告生成的技能
2. **集成 CI/CD**: 在 GitHub Actions 中运行 E2E 测试并上传报告
3. **可视化报告**: 考虑使用 `@playwright/test/reporters` 生成 HTML 报告
4. **截图对比**: 移动端 UI 可添加截图对比测试

---

## 附录: 相关文件

| 文件路径 | 描述 |
|---------|------|
| `playwright.config.ts` | Playwright 配置 |
| `e2e/global-setup.ts` | 全局设置 |
| `e2e/core-flows.spec.ts` | 核心流程测试 |
| `e2e/mobile-responsive.spec.ts` | 移动端响应式测试 |
| `apps/admin/src/components/layout/MobileAppShell.vue` | 移动端 shell 组件 |