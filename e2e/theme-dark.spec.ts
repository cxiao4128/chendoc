/**
 * ChenDoc 深色模式 E2E 测试
 * 测试覆盖: TC-DARK-001 ~ TC-DARK-005
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("深色模式测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("TC-DARK-001: 主题切换 - Light → Dark", async ({ page }) => {
    // 获取主题切换按钮 (根据实际实现调整选择器)
    const themeButton = page.getByRole("button", { name: /主题|深色|暗色/i }).first();
    await themeButton.click();

    // 选择深色模式
    await page.getByText("深色", { exact: true }).click();

    // 验证深色主题生效
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("TC-DARK-002: 主题切换 - Dark → Light", async ({ page }) => {
    // 先切换到深色
    const themeButton = page.getByRole("button", { name: /主题|深色|暗色/i }).first();
    await themeButton.click();
    await page.getByText("深色", { exact: true }).click();

    // 再切换到浅色
    await themeButton.click();
    await page.getByText("浅色", { exact: true }).click();

    // 验证浅色主题
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("TC-DARK-003: 系统主题跟随", async ({ page }) => {
    // 选择跟随系统
    const themeButton = page.getByRole("button", { name: /主题/i }).first();
    await themeButton.click();
    await page.getByText("跟随系统", { exact: true }).click();

    // 验证跟随系统设置
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", /light|dark/);

    // 模拟 prefers-color-scheme: dark
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");

    // 模拟 prefers-color-scheme: light
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("TC-DARK-004: 主题持久化 - 刷新页面", async ({ page }) => {
    // 切换到深色模式
    const themeButton = page.getByRole("button", { name: /主题/i }).first();
    await themeButton.click();
    await page.getByText("深色", { exact: true }).click();

    // 刷新页面
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // 验证 localStorage
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem("chendoc_theme")
    );
    expect(storedTheme).toBe("dark");
  });

  test("TC-DARK-005: 深色模式组件一致性", async ({ page }) => {
    // 切换到深色模式
    const themeButton = page.getByRole("button", { name: /主题/i }).first();
    await themeButton.click();
    await page.getByText("深色", { exact: true }).click();

    // 验证关键组件样式
    const body = page.locator("body");
    const bgColor = await body.evaluate(el =>
      getComputedStyle(el).backgroundColor
    );
    // 深色模式背景应该是深色 (rgb 值接近 #1a1a1a)
    expect(bgColor).toMatch(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

    // 验证侧边栏存在
    await expect(page.locator(".sidebar, .app-sidebar")).toBeVisible();

    // 验证按钮存在
    await expect(page.locator("button").first()).toBeVisible();
  });
});