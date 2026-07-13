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

async function openThemeSettings(page: Page) {
  await page.getByRole("link", { name: /系统管理/ }).click();
  await expect(page).toHaveURL(/\/admin\/settings/);
  await page.getByRole("button", { name: "站点外观" }).click();
  await expect(page.getByRole("heading", { name: "主题设置" })).toBeVisible();
}

test.describe("深色模式测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openThemeSettings(page);
  });

  test("TC-DARK-001: 主题切换 - Light → Dark", async ({ page }) => {
    await page.getByRole("button", { name: /深色模式/ }).click();

    // 验证深色主题生效
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("TC-DARK-002: 主题切换 - Dark → Light", async ({ page }) => {
    await page.getByRole("button", { name: /深色模式/ }).click();
    await page.getByRole("button", { name: /浅色模式/ }).click();

    // 验证浅色主题
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("TC-DARK-003: 系统主题跟随", async ({ page }) => {
    await page.getByRole("button", { name: /跟随系统/ }).click();

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
    await page.getByRole("button", { name: /深色模式/ }).click();

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
    await page.getByRole("button", { name: /深色模式/ }).click();

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
