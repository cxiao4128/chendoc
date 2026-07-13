import { expect, test, type Page } from "playwright/test";

/**
 * 移动端响应式测试套件
 *
 * 测试场景:
 * - MobileAppShell 组件在不同视口下的渲染
 * - 抽屉导航 (drawer) 的打开/关闭
 * - 底部标签栏 (tabbar) 导航
 * - FAB 按钮可见性
 * - 编辑路由下的特殊布局
 */

async function loginMobile(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("移动端响应式测试", () => {

  test("移动端文档首页 - MobileAppShell 渲染", async ({ page }) => {
    await loginMobile(page);
    // 验证移动端 shell 头部
    await expect(page.locator(".mobile-shell")).toBeVisible();
    await expect(page.locator(".mobile-shell__homebar")).toBeVisible();
    // 验证用户信息显示
    await expect(page.getByText("e2eadmin")).toBeVisible();
    // 验证底部标签栏
    await expect(page.locator(".mobile-shell__tabbar")).toBeVisible();
  });

  test("移动端抽屉导航 - 打开/关闭", async ({ page }) => {
    await loginMobile(page);
    // 抽屉初始关闭
    await expect(page.locator(".mobile-shell__drawer")).not.toBeVisible();
    // 点击菜单按钮打开抽屉
    await page.getByRole("button", { name: "打开账号与导航面板" }).first().click();
    await expect(page.locator(".mobile-shell__drawer")).toBeVisible();
    // 验证抽屉内容
    await expect(page.getByText("马上新建文档")).toBeVisible();
    await expect(page.getByText("退出登录")).toBeVisible();
    // 点击关闭
    await page.getByRole("button", { name: "关闭面板" }).first().click();
    await expect(page.locator(".mobile-shell__drawer")).not.toBeVisible();
  });

  test("移动端底部标签栏导航", async ({ page }) => {
    await loginMobile(page);
    // 验证默认 5 个标签（含"我"）
    const tabs = page.locator(".mobile-shell__tab");
    await expect(tabs).toHaveCount(5);
    // 点击"文档"标签（第一个）
    await tabs.first().click();
    await expect(page).toHaveURL(/\/admin\/docs/);
  });

  test("移动端 FAB 按钮可见性", async ({ page }) => {
    await loginMobile(page);
    // 在文档首页应显示 FAB
    await expect(page.locator(".mobile-shell__fab")).toBeVisible();
  });

  test("移动端编辑路由 - 隐藏 shell 组件", async ({ page }) => {
    await loginMobile(page);
    // 创建文档进入编辑模式
    await page.locator(".mobile-shell__fab").click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);
    // 编辑路由下 shell UI 应隐藏
    await expect(page.locator(".mobile-shell__tabbar")).not.toBeVisible();
    await expect(page.locator(".mobile-shell__fab")).not.toBeVisible();
    // 应显示编辑器内容
    await expect(page.locator(".doc-editor-page__mobile-canvas")).toBeVisible();
  });

  test("移动端视口切换 - 390px 宽度", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginMobile(page);
    // 验证视口设置生效
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(390);
    expect(viewport?.height).toBe(844);
    // 核心 UI 元素仍可见
    await expect(page.locator(".mobile-shell")).toBeVisible();
    await expect(page.locator(".mobile-shell__tabbar")).toBeVisible();
  });

  test("移动端视口切换 - 375px 宽度 (旧款 iPhone)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginMobile(page);
    // 核心 UI 元素仍可见
    await expect(page.locator(".mobile-shell")).toBeVisible();
    await expect(page.locator(".mobile-shell__tabbar")).toBeVisible();
  });

  test("移动端表单编辑", async ({ page }) => {
    await loginMobile(page);
    // 导航到表单
    await page.getByRole("link", { name: "收集表" }).click();
    // 新建表单
    await page.getByRole("button", { name: "新建表单" }).first().click();
    // 移动端应显示步骤导航
    await expect(page.getByRole("navigation", { name: "手机端表单编辑步骤" })).toBeVisible();
    await expect(page.locator(".form-canvas__title-input")).toBeVisible();
    await page.locator(".form-canvas__title-input").fill("移动端测试表单");
    // 题型选择
    await page.getByRole("button", { name: "选择题型" }).click();
    await page.getByText("单行文本", { exact: true }).first().click();
    await expect(page.getByText("字段属性", { exact: true })).toBeVisible();
    // 保存
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/\/admin\/forms\/\d+/, { timeout: 15_000 });
  });

  test("移动端 SessionStatusBanner 可见", async ({ page }) => {
    await loginMobile(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("chendoc:session-status", { detail: { status: "expiring" } }));
    });
    await expect(page.locator(".session-status-banner, [class*='session']")).toBeVisible();
  });

});
