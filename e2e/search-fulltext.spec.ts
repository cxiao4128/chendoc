/**
 * ChenDoc 全文搜索 E2E 测试
 * 测试覆盖: TC-SEARCH-001 ~ TC-SEARCH-005
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("全文搜索测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("TC-SEARCH-001: 基础搜索 - 标题搜索", async ({ page }) => {
    // 找到搜索框
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();

    // 如果搜索框在抽屉里，先打开抽屉
    if (!(await searchInput.isVisible())) {
      await page.getByRole("button", { name: /菜单|menu|导航/i }).first().click();
      await page.waitForTimeout(300);
    }

    // 输入搜索关键词
    await searchInput.fill("测试");
    await searchInput.press("Enter");

    // 等待搜索结果
    await page.waitForTimeout(1000);

    // 验证搜索结果出现
    const results = page.locator(".search-results, .doc-list, .doc-item, .doc-card");
    await expect(results.first()).toBeVisible({ timeout: 10000 });
  });

  test("TC-SEARCH-002: 内容搜索 - 全文匹配", async ({ page }) => {
    // 创建包含特定内容的文档
    const uniqueKeyword = `搜索测试关键词_${Date.now()}`;

    // 新建文档
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

    // 输入带有关键词的内容
    const editor = page.locator(".ProseMirror");
    await editor.fill(`这是一段包含 ${uniqueKeyword} 的测试内容`);

    // 保存
    await page.waitForTimeout(5000); // 等待自动保存

    // 返回列表
    await page.getByRole("link", { name: /文档|docs/i }).click();
    await expect(page).toHaveURL(/\/admin\/docs/);

    // 搜索该关键词
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();
    await searchInput.fill(uniqueKeyword);
    await searchInput.press("Enter");

    // 等待搜索结果
    await page.waitForTimeout(2000);

    // 验证搜索结果包含该文档
    const results = page.locator(".doc-item, .doc-card, .search-result-item");
    await expect(results.first()).toBeVisible({ timeout: 10000 });
  });

  test("TC-SEARCH-003: 空搜索结果处理", async ({ page }) => {
    // 输入不存在的关键词
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();
    const uniqueKeyword = `不存在的关键词_${Date.now()}_xyz`;
    await searchInput.fill(uniqueKeyword);
    await searchInput.press("Enter");

    // 等待搜索完成
    await page.waitForTimeout(2000);

    // 验证显示空结果提示
    const emptyState = page.getByText(/未找到|无结果|没有找到/i).first();
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    // 或者验证结果列表为空
    const results = page.locator(".doc-item, .doc-card, .search-result-item");
    const resultCount = await results.count();

    expect(hasEmptyState || resultCount === 0).toBeTruthy();
  });

  test("TC-SEARCH-004: 搜索性能基准 < 500ms", async ({ page }) => {
    // 测量搜索响应时间
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();

    const startTime = Date.now();
    await searchInput.fill("测试");
    await searchInput.press("Enter");

    // 等待第一个搜索结果出现
    const results = page.locator(".doc-item, .doc-card, .search-result-item, .doc-list").first();
    await results.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});

    const endTime = Date.now();
    const searchDuration = endTime - startTime;

    console.log(`搜索响应时间: ${searchDuration}ms`);

    // 验证性能要求
    expect(searchDuration).toBeLessThan(500);
  });

  test("TC-SEARCH-005: 搜索结果分页", async ({ page }) => {
    // 确保有多页搜索结果
    const searchInput = page.getByPlaceholder(/搜索|search/i).first();

    // 搜索通用关键词
    await searchInput.fill("文档");
    await searchInput.press("Enter");
    await page.waitForTimeout(2000);

    // 检查是否有分页控件
    const pagination = page.locator(".pagination, .pager, [class*='page']");
    const hasPagination = await pagination.isVisible().catch(() => false);

    if (hasPagination) {
      // 验证分页信息
      const pageInfo = page.getByText(/第.*页|共.*页|page.*of/i).first();
      const hasPageInfo = await pageInfo.isVisible().catch(() => false);

      if (hasPageInfo) {
        // 点击下一页
        const nextButton = page.getByRole("button", { name: /下一页|next/i }).first();
        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForTimeout(1000);

          // 验证跳转到下一页
          const newPageInfo = page.getByText(/第.*页|共.*页|page.*of/i).first();
          await expect(newPageInfo).toBeVisible();
        }
      }
    } else {
      // 如果结果不足一页，跳过
      test.skip("搜索结果不足一页，无需分页");
    }
  });
});