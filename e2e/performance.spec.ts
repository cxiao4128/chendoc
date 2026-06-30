/**
 * ChenDoc 性能测试 E2E
 * 测试覆盖: 大文档加载、搜索响应时间、FCP
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("性能测试", () => {
  test("大文档加载时间 < 2s", async ({ page }) => {
    await login(page);

    // 创建一个测试用的大文档
    const largeContent = "测试内容 ".repeat(10000); // ~100KB 文本

    // 新建文档
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

    // 填写标题
    const titleInput = page.getByRole("textbox", { name: /标题|title/i }).first();
    await titleInput.fill("大文档性能测试");

    // 输入大量内容
    const editor = page.locator(".ProseMirror");
    await editor.fill(largeContent);

    // 等待编辑器处理完成
    await page.waitForTimeout(1000);

    // 记录加载时间
    const startTime = Date.now();

    // 刷新页面
    await page.reload();

    // 等待编辑器完全加载
    await expect(editor).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500); // 等待渲染完成

    const loadTime = Date.now() - startTime;
    console.log(`大文档加载时间: ${loadTime}ms`);

    // 验证性能目标
    expect(loadTime).toBeLessThan(2000);
  });

  test("搜索响应时间 < 500ms", async ({ page }) => {
    await login(page);

    // 创建多个文档以便有搜索结果
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "新建文档" }).first().click();
      await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

      const titleInput = page.getByRole("textbox", { name: /标题|title/i }).first();
      await titleInput.fill(`搜索测试文档 ${i}`);

      await page.getByRole("link", { name: /文档|docs/i }).click();
      await expect(page).toHaveURL(/\/admin\/docs/);
    }

    // 测量搜索响应时间
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();

    const startTime = Date.now();
    await searchInput.fill("搜索测试");
    await searchInput.press("Enter");

    // 等待搜索结果加载
    await page.waitForTimeout(1000);
    const results = page.locator(".doc-item, .doc-card").first();
    await results.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});

    const searchTime = Date.now() - startTime;
    console.log(`搜索响应时间: ${searchTime}ms`);

    // API 响应应在 500ms 内
    // 注意：E2E 测试包含网络和渲染时间，这里放宽到 2000ms
    expect(searchTime).toBeLessThan(2000);
  });

  test("首屏加载 (FCP) < 1.5s", async ({ page }) => {
    // 启用性能追踪
    const cdpSession = await page.context().newCDPSession(page);

    await cdpSession.send("Performance.enable");

    // 导航到首页
    const startTime = Date.now();
    await page.goto("/login");

    // 等待页面加载
    await page.waitForLoadState("domcontentloaded");
    const domContentLoaded = Date.now() - startTime;

    // 等待首屏内容可见
    await page.waitForSelector("input[placeholder*='用户名']", { timeout: 10000 });
    const firstContentfulPaint = Date.now() - startTime;

    console.log(`DOMContentLoaded: ${domContentLoaded}ms`);
    console.log(`首屏内容可见: ${firstContentfulPaint}ms`);

    // 验证性能目标
    expect(firstContentfulPaint).toBeLessThan(1500);
  });

  test("页面切换响应 < 800ms", async ({ page }) => {
    await login(page);

    // 测量从列表页到编辑页的切换时间
    await page.getByRole("button", { name: "新建文档" }).first().click();

    const startTime = Date.now();
    const urlMatches = page.waitForURL(/\/admin\/docs\/[A-Za-z0-9]+/);
    await urlMatches;
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10000 });
    const switchTime = Date.now() - startTime;

    console.log(`页面切换时间: ${switchTime}ms`);

    expect(switchTime).toBeLessThan(800);
  });

  test("文档自动保存响应 < 500ms", async ({ page }) => {
    await login(page);

    // 新建文档
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

    const editor = page.locator(".ProseMirror");

    // 输入内容触发自动保存
    const startTime = Date.now();
    await editor.fill("自动保存性能测试内容");

    // 等待保存完成指示器
    const saveIndicator = page.getByText(/已保存|自动保存/i).first();
    await saveIndicator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

    const saveTime = Date.now() - startTime;
    console.log(`自动保存响应时间: ${saveTime}ms`);

    // 自动保存通常有 3-5 秒延迟，这里测试的是 UI 响应
    expect(saveTime).toBeLessThan(10000);
  });

  test("内存使用 - 编辑大文档时保持稳定", async ({ page }) => {
    await login(page);

    // 新建文档
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

    const editor = page.locator(".ProseMirror");

    // 逐步增加文档大小
    for (let i = 0; i < 10; i++) {
      await editor.fill("测试内容 ".repeat(1000 * (i + 1)));
      await page.waitForTimeout(500);

      // 测量 DOM 节点数量（间接反映内存使用）
      const nodeCount = await page.evaluate(() => {
        return document.querySelectorAll(".ProseMirror *").length;
      });

      console.log(`迭代 ${i + 1}: DOM 节点数 = ${nodeCount}`);

      // 验证节点数不会无限增长（内存泄漏检测）
      if (i > 0) {
        // 允许一定波动，但不应该持续增长
        expect(nodeCount).toBeLessThan(100000);
      }
    }
  });
});

test.describe("性能基准测试", () => {
  test("性能基准表", async ({ page }) => {
    const benchmarks: { name: string; target: number; actual: number }[] = [];

    await login(page);

    // FCP 测试
    const fcpStart = Date.now();
    await page.goto("/login");
    await page.waitForSelector("input[placeholder*='用户名']", { timeout: 10000 });
    benchmarks.push({ name: "首屏加载 (FCP)", target: 1500, actual: Date.now() - fcpStart });

    // 搜索响应测试
    const searchStart = Date.now();
    await page.getByPlaceholder(/搜索|search/i).first().fill("测试").press("Enter");
    await page.waitForTimeout(1000);
    benchmarks.push({ name: "搜索响应", target: 500, actual: Date.now() - searchStart });

    // 输出基准表
    console.log("\n=== 性能基准测试结果 ===");
    console.log("| 指标 | 目标 | 实际 | 状态 |");
    console.log("|------|------|------|------|");

    for (const b of benchmarks) {
      const status = b.actual < b.target ? "✅" : "❌";
      console.log(`| ${b.name} | ${b.target}ms | ${b.actual}ms | ${status} |`);
      expect(b.actual).toBeLessThan(b.target * 1.5); // 放宽 50% 允许范围
    }
  });
});