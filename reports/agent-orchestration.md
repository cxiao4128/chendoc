# 测试 Agent 编排方案

> ChenDoc 项目测试自动化协作流程设计
> 版本: 1.0.0 | 日期: 2026-07-01

## 1. 概述

### 1.1 目标
设计自动化测试 Agent 的并行执行、依赖管理、结果汇总机制，确保测试工程师（automation-test-engineer）和 DevOps（devops-engineer）工作协调有序。

### 1.2 现有测试资产

| 类型 | 路径 | 测试框架 | 说明 |
|------|------|----------|------|
| 单元测试 | `server/src/**/*.test.ts` | Vitest | 16+ 个测试文件，覆盖 gateway、auth、docs、forms、uploads 等模块 |
| E2E 测试 | `e2e/*.spec.ts` | Playwright | 核心流程测试（登录、编辑、表单提交） |
| 安全审计 | `npm run security:audit` | npm audit | 依赖漏洞扫描 |

---

## 2. 任务并行执行方案

### 2.1 测试分层模型

```
┌─────────────────────────────────────────────────────────┐
│                    CI/CD Pipeline                        │
├─────────────────────────────────────────────────────────┤
│  Stage 1: 静态检查 (并行)                                │
│  ├── lint ─────────────► typecheck                      │
│  └── (独立运行，无依赖)                                   │
├─────────────────────────────────────────────────────────┤
│  Stage 2: 单元测试 (并行)                                │
│  ├── auth-tests ────────────────────────────────────────►┐
│  ├── docs-tests ────────────────────────────────────────►┼─► 汇总
│  ├── forms-tests ───────────────────────────────────────►┤  报告
│  ├── gateway-tests ─────────────────────────────────────►┤
│  └── utils-tests ───────────────────────────────────────►┘
├─────────────────────────────────────────────────────────┤
│  Stage 3: E2E 测试 (串行，依赖 Stage 2)                  │
│  └── [DevOps 部署测试环境后执行]                          │
├─────────────────────────────────────────────────────────┤
│  Stage 4: 安全扫描 (并行)                                │
│  ├── audit ─────────────────────────────────────────────►┐
│  └── audit:signatures ──────────────────────────────────►┘
└─────────────────────────────────────────────────────────┘
```

### 2.2 并行执行策略

#### 策略 A: 单元测试并行化（Vitest）

```typescript
// vitest.config.ts
export default defineConfig({
  pool: 'forks',           // 使用进程池并行执行
  poolOptions: {
    forks: {
      singleFork: false,   // 允许多个 worker
      maxParallel: 4       // 最多 4 个并行进程
    }
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html']
  }
});
```

#### 策略 B: E2E 测试并行化（Playwright）

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ],
  // 同一项目内按文件并行
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0
});
```

### 2.3 执行时序

| 阶段 | 负责 Agent | 并行度 | 超时 | 失败策略 |
|------|-----------|--------|------|----------|
| lint + typecheck | DevOps | 2 并行 | 5 min | 任一失败则阻止后续 |
| 单元测试 | Automation Test Engineer | 4 并行进程 | 10 min | 失败不影响 E2E（独立环境） |
| 部署测试环境 | DevOps | - | 5 min | 失败则跳过 E2E |
| E2E 测试 | Automation Test Engineer | 2 workers | 15 min | 失败记录，不阻止发布 |
| 安全审计 | DevOps | 2 并行 | 3 min | 警告，不阻止发布 |

---

## 3. 依赖管理机制

### 3.1 任务依赖图

```
lint ──────────────┐
                   ├──► typecheck ──► build ──► 部署测试环境 ──► E2E
typecheck ─────────┘       │
                           ▼
                   ┌─── 单元测试 (并行)
                   │
sanitize.test.ts ◄─┤
packet.test.ts ◄───┤
auth.*.test.ts ◄───┤
docs.*.test.ts ◄───┤
forms.*.test.ts ◄──┤
uploads.*.test.ts ◄┘
```

### 3.2 依赖管理配置

```yaml
# .agents/test-orchestration.yaml
name: test-orchestration
version: "1.0"

dependencies:
  lint:
    type: stage
    requires: []
    runs_after: []

  typecheck:
    type: stage
    requires: [lint]
    runs_after: []

  unit-tests:
    type: parallel_group
    requires: [typecheck]
    tasks:
      - id: auth-tests
        file: server/src/modules/auth/**/*.test.ts
      - id: docs-tests
        file: server/src/modules/docs/**/*.test.ts
      - id: forms-tests
        file: server/src/modules/forms/**/*.test.ts
      - id: gateway-tests
        file: server/src/gateway/**/*.test.ts
      - id: utils-tests
        file: server/src/utils/**/*.test.ts

  build:
    type: stage
    requires: [typecheck]
    runs_after: [unit-tests]

  deploy-test:
    type: stage
    requires: [build]
    runs_after: []

  e2e-tests:
    type: parallel_group
    requires: [deploy-test]
    tasks:
      - id: core-flows
        file: e2e/core-flows.spec.ts
        workers: 2

  security-audit:
    type: parallel_group
    requires: [build]
    tasks:
      - id: audit
        command: npm run security:audit
      - id: audit-signatures
        command: npm run security:audit:signatures
```

### 3.3 依赖检查点

| 检查点 | 说明 | 失败处理 |
|--------|------|----------|
| `lint` 通过 | ESLint + Prettier 检查 | 阻止后续所有阶段 |
| `typecheck` 通过 | TypeScript 类型检查 | 阻止编译和测试 |
| `unit-tests` 通过 | 所有单元测试通过 | 记录结果，E2E 继续 |
| `build` 成功 | 前后端构建完成 | 阻止部署 |
| `deploy-test` 成功 | 测试环境就绪 | 跳过 E2E，不影响主流程 |
| `e2e-tests` 通过 | 核心流程无回归 | 记录结果，不阻止发布 |
| `security-audit` 通过 | 无高危漏洞 | 警告，不阻止发布 |

---

## 4. 结果汇总与报告机制

### 4.1 测试报告结构

```
reports/
├── test-results/
│   ├── unit/
│   │   ├── auth-tests.json
│   │   ├── docs-tests.json
│   │   ├── forms-tests.json
│   │   ├── gateway-tests.json
│   │   └── utils-tests.json
│   ├── e2e/
│   │   └── test-results.html
│   └── security/
│       ├── audit.json
│       └── audit-signatures.json
└── test-summary.md
```

### 4.2 汇总报告模板

```markdown
# 测试执行报告

**执行时间**: 2026-07-01 12:00:00
**触发方式**: CI / 手动触发
**Git Commit**: abc1234

## 执行摘要

| 阶段 | 状态 | 耗时 | 通过/总数 |
|------|------|------|-----------|
| Lint | ✅ PASS | 1m 23s | - |
| TypeCheck | ✅ PASS | 2m 15s | - |
| 单元测试 | ✅ PASS | 4m 32s | 142/142 |
| E2E 测试 | ⚠️ PARTIAL | 8m 45s | 2/3 |
| 安全审计 | ✅ PASS | 0m 58s | - |

## 详细结果

### 单元测试
<!-- 汇总各模块测试结果 -->

### E2E 测试
<!-- 核心流程测试结果 -->

### 安全审计
<!-- 依赖漏洞扫描结果 -->

## 失败用例（如有）

<!-- 失败用例详情 -->
```

### 4.3 报告生成脚本

```typescript
// scripts/generate-test-report.ts
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  suites?: TestResult[];
}

async function generateTestReport(outputDir: string): Promise<string> {
  const unitResults = await loadJsonResults(join(outputDir, 'unit'));
  const e2eResults = await loadE2eResults(join(outputDir, 'e2e'));
  const securityResults = await loadSecurityResults(join(outputDir, 'security'));

  const summary = calculateSummary(unitResults, e2eResults, securityResults);

  return renderMarkdownReport({
    timestamp: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || 'unknown',
    summary,
    unitResults,
    e2eResults,
    securityResults
  });
}
```

---

## 5. Agent 协作协议

### 5.1 角色职责

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| **Automation Test Engineer** | 编写/维护测试用例，执行测试 | 代码变更、测试配置 | 测试结果、失败分析 |
| **DevOps** | 维护 CI/CD 流水线，环境配置 | 测试结果 | 部署状态、报告链接 |

### 5.2 消息协议

```
┌─────────────────┐     触发测试      ┌─────────────────────┐
│   Leader        │ ─────────────────► │ Automation Test Eng │
└─────────────────┘                   └─────────────────────┘
                                                │
                                                ▼
                                        ┌─────────────────────┐
                                        │  并行执行测试        │
                                        │  - unit-tests       │
                                        │  - e2e-tests        │
                                        └─────────────────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
            ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
            │  auth-tests   │           │  docs-tests   │           │  e2e-tests    │
            └───────────────┘           └───────────────┘           └───────────────┘
                    │                           │                           │
                    └───────────────────────────┼───────────────────────────┘
                                                ▼
                                        ┌─────────────────────┐
                                        │  DevOps             │
                                        │  - 环境准备         │
                                        │  - 报告汇总         │
                                        │  - 状态通知         │
                                        └─────────────────────┘
                                                │
                                                ▼
                                        ┌─────────────────────┐
                                        │  Leader             │
                                        │  结果汇报           │
                                        └─────────────────────┘
```

### 5.3 失败重试策略

| 失败类型 | 重试次数 | 重试间隔 | 降级策略 |
|----------|----------|----------|----------|
| 网络/环境问题 | 3 | 30s | 跳过该测试，标记 `skip` |
| 断言失败 | 0 | - | 直接报告失败 |
| 超时 | 2 | 60s | 延长超时后重试 |
| 间歇性失败 (flaky) | 2 | 30s | 标记为 flaky，记录不阻止 |

### 5.4 通知机制

```typescript
interface TestNotification {
  type: 'start' | 'progress' | 'complete' | 'failure';
  stage: string;
  timestamp: string;
  details?: {
    passed?: number;
    failed?: number;
    skipped?: number;
    duration?: number;
    error?: string;
  };
}
```

---

## 6. CI/CD 集成

### 6.1 GitHub Actions 工作流

```yaml
# .github/workflows/test.yml
name: Test Pipeline

on: [push, pull_request]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run test -- --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        with:
          name: unit-test-results-shard-${{ matrix.shard }}
          path: reports/unit/

  e2e-tests:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Run dev server
        run: npm run start &
      - name: Run E2E tests
        run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-test-results
          path: test-results/

  security-audit:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run security:audit
      - run: npm run security:audit:signatures
```

### 6.2 本地开发脚本

```json
// package.json 追加
{
  "scripts": {
    "test:parallel": "concurrently \"npm run test:server\" \"npm run test:e2e\"",
    "test:ci": "npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e",
    "test:report": "node scripts/generate-test-report.ts"
  }
}
```

---

## 7. 监控与可观测性

### 7.1 测试指标

| 指标 | 说明 | 采集方式 |
|------|------|----------|
| 测试覆盖率 | 各模块代码覆盖率 | Vitest coverage |
| 测试通过率 | 通过/总数 | 测试结果 JSON |
| 平均执行时间 | 各测试套件耗时 | 测试结果 JSON |
| Flaky 测试率 | 间歇性失败占比 | 重试历史 |
| E2E 成功率 | 核心流程通过率 | Playwright report |

### 7.2 告警规则

| 规则 | 阈值 | 动作 |
|------|------|------|
| 单元测试失败 | > 0 | 通知 Test Engineer |
| E2E 测试失败 | > 0 | 通知 Test Engineer |
| 安全高危漏洞 | > 0 | 阻止部署，通知 DevOps |
| 测试超时 | > 30% 套件超时 | 通知 DevOps |

---

## 8. 附录

### 8.1 现有测试文件清单

| 模块 | 测试文件 | 框架 |
|------|----------|------|
| Gateway | `packet.test.ts`, `action-registry.test.ts` | Vitest |
| Auth | `loginRisk.service.test.ts`, `session.service.test.ts`, `auth.restore.test.ts` | Vitest |
| Docs | `docs.service.test.ts` | Vitest |
| Forms | `forms.service.test.ts`, `forms.public.test.ts`, `forms.public.routes.test.ts` | Vitest |
| Uploads | `uploads.service.test.ts` | Vitest |
| Public | `public.routes.test.ts` | Vitest |
| Utils | `sanitize.test.ts`, `httpsRequest.test.ts` | Vitest |
| DB | `client.test.ts`, `schema.contract.test.ts` | Vitest |
| E2E | `core-flows.spec.ts` | Playwright |

### 8.2 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-07-01 | 初始版本，定义并行执行、依赖管理、结果汇总机制 |