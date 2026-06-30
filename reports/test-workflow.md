# ChenDoc 自动化测试工作流设计

> 文档版本：1.0.0
> 创建日期：2026-07-01
> 状态：草稿

## 1. 现状分析

### 1.1 现有测试架构

| 层级 | 工具 | 现状 | 覆盖范围 |
|------|------|------|----------|
| **单元测试** | Vitest | ✅ 已建立 | Gateway 加密、Auth 服务、表单服务、DB 客户端等 16 个测试文件 |
| **集成测试** | Vitest + SQLite | ✅ 已建立 | 服务层逻辑、数据库操作、路由验证 |
| **E2E 测试** | Playwright | ✅ 核心流程 | 登录、文档编辑、表单提交流程 |
| **覆盖率** | Vitest v8 | ⚠️ 手动触发 | 未集成 CI，仅 `npm run test` 本地运行 |

### 1.2 现有测试文件清单

```
server/src/
├── db/
│   ├── client.test.ts           # 数据库连接与初始化
│   └── schema.contract.test.ts  # Schema 契约验证
├── gateway/
│   ├── packet.test.ts           # Gateway 加密/解密、challenge 防重放
│   └── action-registry.test.ts  # Action 注册与路由
├── modules/
│   ├── auth/
│   │   ├── session.service.test.ts      # 会话管理与 Token 轮换
│   │   ├── loginRisk.service.test.ts    # 登录风险评估与锁定
│   │   └── auth.restore.test.ts         # 账户恢复流程
│   ├── docs/
│   │   └── docs.service.test.ts         # 文档 CRUD 与权限
│   ├── forms/
│   │   ├── forms.service.test.ts        # 表单创建、发布、提交验证
│   │   ├── forms.public.test.ts         # 公开表单提交
│   │   └── forms.public.routes.test.ts  # 公开路由权限
│   ├── shares/
│   │   └── shares.service.test.ts       # 分享创建与访问控制
│   ├── uploads/
│   │   └── uploads.service.test.ts      # 文件上传与清理
│   └── public/
│       └── public.routes.test.ts        # 公开路由验证
└── utils/
    ├── sanitize.test.ts         # HTML 清洗逻辑
    └── httpsRequest.test.ts     # HTTPS 请求工具

e2e/
└── core-flows.spec.ts          # 登录→编辑→自动保存→分享→退出
                                # 公开表单→手机预览→发布→提交→成功提示
```

### 1.3 现有 CI/CD 流程

```
security-ci.yml (主流程)
├── npm audit --omit=dev         # 依赖安全审计
├── check:architecture           # 架构规范检查
├── lint + typecheck             # 前端代码质量
├── env:check                    # 环境变量检查
├── vitest run                   # 单元/集成测试 (SQLite)
├── db:migrate                   # 数据库迁移
├── test:mysql-integrity         # MySQL 完整性冒烟测试
├── admin build + server build   # 构建
├── playwright install           # E2E 环境准备
└── test:e2e                     # E2E 测试
```

### 1.4 覆盖缺口分析

| 缺口 | 风险等级 | 说明 |
|------|----------|------|
| 前端单元测试缺失 | 🔴 高 | apps/admin 无任何 Vitest/Jest 测试 |
| Gateway 集成测试缺失 | 🔴 高 | 仅测试加密逻辑，未覆盖端到端 Gateway 流程 |
| 权限边界测试不足 | 🟡 中 | access.ts 路由权限无专项测试 |
| 错误恢复路径未测试 | 🟡 中 | 网络超时、数据库回滚等异常分支 |
| R2 上传测试缺失 | 🟡 中 | 文件上传模块无测试 |
| 测试报告未集成 | 🟡 中 | 覆盖率报告未在 CI 生成/展示 |

---

## 2. 测试分层策略

### 2.1 分层模型

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E Tests (Playwright)                   │
│  真实浏览器 × 完整前后端 × SQLite 数据库                      │
│  覆盖：用户核心路径、跨模块交互、UI 交互                      │
├─────────────────────────────────────────────────────────────┤
│                  Integration Tests (Vitest)                 │
│  Fastify inject() × 真实数据库 × Gateway 加密链路            │
│  覆盖：API 路由、权限验证、数据一致性、业务流程               │
├─────────────────────────────────────────────────────────────┤
│                   Unit Tests (Vitest)                       │
│  隔离服务 × Mock 数据库 × 假时钟                            │
│  覆盖：业务逻辑、边界条件、错误处理                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各层职责定义

#### 层级 1：单元测试 (Unit Tests)

**目标**：验证独立业务逻辑的正确性

**执行环境**：
- Node.js 18+
- Vitest (in-process)
- SQLite 临时数据库（每个测试文件独立）
- vi.useFakeTimers() 用于时间敏感测试

**测试范围**：
```
✅ 应测试
- 服务层纯函数逻辑（sanitize、加密、验证）
- 边界条件（空值、极大值、特殊字符）
- 错误分支与异常抛出
- 时间相关逻辑（会话过期、速率限制）

❌ 不测试
- HTTP 请求/响应
- 数据库连接细节
- 第三方服务调用
```

**命名规范**：`{module}.{service|util}.test.ts`

---

#### 层级 2：集成测试 (Integration Tests)

**目标**：验证模块间交互与 API 路由

**执行环境**：
- Fastify 实例（通过 inject()）
- SQLite 临时数据库
- Gateway 中间件启用

**测试范围**：
```
✅ 应测试
- API 路由：请求 → Gateway → 路由 → 响应
- 权限检查：用户角色 × 资源权限矩阵
- 数据一致性：创建 → 查询 → 更新 → 删除
- 事务回滚：异常情况下的数据库状态

❌ 不测试
- 真实 HTTP 网络调用
- 浏览器渲染行为
- 大文件上传到 R2
```

**命名规范**：`{module}.routes.test.ts` 或 `{module}.integration.test.ts`

---

#### 层级 3：E2E 测试 (Playwright)

**目标**：验证真实用户操作路径

**执行环境**：
- 真实浏览器（Chromium）
- 完整服务器进程
- SQLite 测试数据库

**测试范围**：
```
✅ 应测试
- 完整用户旅程：登录 → 操作 → 退出
- UI 交互：点击、输入、等待状态变化
- 跨域/公开页面：分享链接、表单公开提交
- 移动端适配：响应式布局

❌ 不测试
- 内部 API 调用细节
- 数据库内部状态
- 非关键 UI 元素样式
```

---

## 3. 测试工作流设计

### 3.1 本地开发工作流

```yaml
# 工作流名称：Local Development Test Flow

触发条件:
  - 手动执行 npm test
  - IDE 保存时自动运行（需配置）

阶段:
  Stage 1: 快速检查 (5s)
    命令: npm run test -- --run --reporter=dot
    范围: 变更文件的直接相关测试
    失败处理: 阻塞提交，提供快速反馈

  Stage 2: 完整单元测试 (30s)
    命令: npm run test
    范围: 所有 server/src/**/*.test.ts
    覆盖率: 生成 text 报告
    失败处理: 显示失败测试的完整堆栈

  Stage 3: 类型检查 (10s)
    命令: npm run typecheck
    失败处理: 显示 TS 错误位置

  Stage 4: Lint 检查 (5s)
    命令: npm run lint
    失败处理: 显示 ESLint 错误

  Stage 5: E2E 测试 (可选, 60s)
    命令: npm run test:e2e
    条件: --include-e2e 标志或 CI 环境
    失败处理: 截图 + Trace 保存
```

### 3.2 CI/CD 集成工作流

```yaml
# 工作流名称：CI Test Pipeline

触发条件:
  - push 到任何分支
  - PR 创建/更新

环境:
  Node.js: 20 LTS
  数据库: MySQL 8.4 (services)
  缓存: npm cache

阶段:
  Stage 1: 环境准备
    步骤:
      - Checkout code
      - Setup Node.js 20
      - npm ci --workspaces
      - 启动 MySQL 服务
      - 配置环境变量

  Stage 2: 安全与静态检查
    步骤:
      - npm audit --omit=dev
      - npm run check:architecture
      - npm run lint
      - npm run typecheck
      - npm run env:check
    失败策略: 快速失败，不继续后续阶段

  Stage 3: 单元与集成测试 (MySQL)
    步骤:
      - npm run db:migrate
      - npm --prefix server run test -- --reporter=junit --output=./test-results/unit.xml
      - npm run test:mysql-integrity
    覆盖率:
      目标: 70%+
      报告: lcov → Codecov/coveralls
    失败策略: 允许重试 1 次（flaky test 检测）

  Stage 4: 构建验证
    步骤:
      - npm run build
      - 验证 dist 产物完整性
    失败策略: 硬失败

  Stage 5: E2E 测试
    步骤:
      - npx playwright install --with-deps chromium
      - npm run test:e2e -- --reporter=html,junit
    产物:
      - HTML 报告: ./playwright-report/index.html
      - JUnit XML: ./test-results/e2e.xml
      - Trace: ./test-results/trace.zip (失败时)
    失败策略: 允许重试 1 次，保留失败截图

  Stage 6: 测试报告聚合
    步骤:
      - 收集所有 JUnit XML
      - 生成合并覆盖率报告
      - 上传到测试仪表盘
    产物:
      - test-results/
      └── coverage/
```

### 3.3 失败处理与重试策略

```yaml
失败处理矩阵:

| 失败类型         | 第一次失败    | 第二次失败    | 最终处理              |
|------------------|---------------|---------------|-----------------------|
| 单元测试         | 重试当前文件  | 报告并失败    | 输出失败测试详情      |
| 集成测试         | 重试当前文件  | 报告并失败    | 输出数据库状态快照    |
| E2E 测试         | 重试全套      | 报告并失败    | 保存截图 + Trace      |
| 构建失败         | 不重试        | -             | 报告构建错误          |
| 类型检查失败     | 不重试        | -             | 显示 TS 错误          |
| Lint 失败        | 不重试        | -             | 显示 ESLint 错误      |

超时策略:
  - 单元测试: 30s/测试
  - 集成测试: 60s/测试
  - E2E 测试: 60s/测试，全局 5 分钟
  - CI 作业: 最大 15 分钟

Flaky Test 检测:
  - 同一测试连续 2 次失败 → 标记为 flaky
  - Flaky 测试自动降级到"警告"级别
  - 需人工确认后恢复
```

---

## 4. 测试报告生成方案

### 4.1 报告类型

| 报告类型 | 生成工具 | 格式 | 存储位置 |
|----------|----------|------|----------|
| 单元测试报告 | Vitest | JUnit XML + HTML | test-results/unit/ |
| 覆盖率报告 | Vitest v8 | LCOV + HTML | coverage/lcov-report/ |
| E2E 报告 | Playwright | HTML + JUnit XML | playwright-report/ |
| E2E Trace | Playwright | ZIP | test-results/trace/ |
| 合并报告 | Allure (可选) | HTML + JSON | allure-results/ |

### 4.2 Vitest 配置增强

```typescript
// server/vitest.config.ts 增强建议

export default defineConfig({
  test: {
    // ... 现有配置 ...
    reporters: [
      'default',                    // 终端输出
      ['junit', { outputFile: 'test-results/unit/junit.xml' }]
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70
      }
    },
    outputFile: {
      junit: 'test-results/unit/junit.xml'
    }
  }
});
```

### 4.3 Playwright 报告配置

```typescript
// playwright.config.ts 增强建议

export default defineConfig({
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e/junit.xml' }]
  ],
  trace: 'on-first-retry',  // 仅首次失败时保留 Trace
  screenshot: 'only-on-failure'
});
```

### 4.4 CI 报告上传

```yaml
# GitHub Actions 报告上传步骤
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results
    path: |
      test-results/
      playwright-report/
      coverage/

- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
    token: ${{ secrets.CODECOV_TOKEN }}
```

---

## 5. 新增测试建议

### 5.1 前端测试 (apps/admin)

```typescript
// 建议结构
apps/admin/src/
├── components/
│   ├── __tests__/
│   │   ├── DocTree.test.tsx
│   │   ├── EditorToolbar.test.tsx
│   │   └── FormCanvas.test.tsx
│   └── composables/
│       └── __tests__/
│           └── useDocument.test.ts
├── gateway/
│   └── __tests__/
│       └── client.test.ts
└── utils/
    └── __tests__/
        └── format.test.ts
```

### 5.2 Gateway 集成测试

```typescript
// server/src/gateway/gateway.integration.test.ts
// 建议覆盖场景：
// 1. 完整请求加密 → 路由 → 响应解密流程
// 2. Challenge 防重放验证
// 3. Token 过期处理
// 4. 并发请求处理
```

### 5.3 权限测试矩阵

```typescript
// server/src/router/__tests__/access.integration.test.ts
// 建议覆盖：用户角色 × 操作权限 × 资源类型
const permissionMatrix = [
  { role: 'admin', action: 'create', resource: 'doc', expected: 201 },
  { role: 'user', action: 'create', resource: 'doc', expected: 201 },
  { role: 'guest', action: 'create', resource: 'doc', expected: 403 },
  // ... 完整矩阵
];
```

### 5.4 异常路径测试

```typescript
// 建议新增测试场景：
// 1. 数据库连接失败时的优雅降级
// 2. R2 上传失败时的错误处理
// 3. 网络超时重试逻辑
// 4. 并发写入冲突处理
// 5. 大文件上传内存限制
```

---

## 6. 实施路线图

### Phase 1: 完善现有测试 (1-2 周)

- [ ] 增强 Vitest 配置：添加 JUnit 输出和覆盖率阈值
- [ ] 增强 Playwright 配置：添加 HTML/JUnit 报告
- [ ] 创建 `test:coverage` 脚本，生成覆盖率报告
- [ ] 在 CI 中集成覆盖率上传

### Phase 2: 新增关键测试 (2-4 周)

- [ ] 添加前端基础组件测试（Vitest + Vue Test Utils）
- [ ] 添加 Gateway 集成测试
- [ ] 添加权限路由测试矩阵
- [ ] 添加 R2 上传测试（Mock S3）

### Phase 3: 优化 CI/CD (1 周)

- [ ] 添加 Allure 测试报告聚合
- [ ] 配置测试仪表盘（Dash0/Grafana）
- [ ] 添加测试趋势分析
- [ ] 实现 flaky test 自动检测

### Phase 4: 持续改进

- [ ] 定期审查测试覆盖率
- [ ] 添加性能基准测试
- [ ] 添加安全测试（SQL 注入、XSS 等）
- [ ] 添加可访问性测试 (a11y)

---

## 7. 附录

### 7.1 命令速查表

```bash
# 本地测试
npm run test                    # 单元测试 + 覆盖率
npm run test -- --watch         # 监听模式
npm run test:e2e                # E2E 测试
npm run test:e2e -- --ui        # E2E UI 模式
npm run test:e2e -- --debug     # E2E 调试模式

# 覆盖率
npm run test -- --coverage      # 带覆盖率
open coverage/lcov-report/index.html

# CI 等效
npm run check                   # 完整检查（lint + typecheck + test + build）
```

### 7.2 环境变量参考

```bash
# 测试专用环境变量
NODE_ENV=test
DATABASE_PROVIDER=sqlite|mysql
DATABASE_URL=./data/test.sqlite
CHENDOC_ALLOW_SQLITE_RUNTIME=true
```

### 7.3 测试数据库隔离策略

- 每个 `.test.ts` 文件使用独立的 SQLite 临时目录
- 使用 `beforeEach` 清空相关表数据
- 使用 `afterAll` 清理临时目录
- CI 环境使用 MySQL 服务进行最终验证

---

## 8. 决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-07-01 | 保持 Vitest 作为单元/集成测试框架 | 与现有架构一致，学习曲线低 |
| 2026-07-01 | 保持 Playwright 作为 E2E 测试框架 | 已有的核心流程测试，生态成熟 |
| 2026-07-01 | 覆盖率目标设为 70% | 平衡测试投入与项目进度 |
| 2026-07-01 | E2E 测试使用 SQLite | 简化 CI 环境，提升测试稳定性 |
| 2026-07-01 | MySQL 仅用于 CI 完整性验证 | 确保生产环境兼容性 |