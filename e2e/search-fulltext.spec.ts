/**
 * ChenDoc 全文搜索 E2E 测试
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

async function createSearchDoc(page: Page, title: string, content: string) {
  await page.getByRole("button", { name: "新建文档" }).first().click();
  await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);
  const docUid = page.url().match(/\/admin\/docs\/([A-Za-z0-9]+)/)?.[1] ?? "";
  await page.getByRole("textbox", { name: "文档标题" }).first().fill(title);
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click({ position: { x: 24, y: 24 } });
  await editor.pressSequentially(content, { delay: 1 });
  await expect(editor).toContainText(content, { timeout: 10000 });
  await expect.poll(async () => {
    const metrics = await page.locator(".doc-editor-page__metrics, .doc-editor-header__metrics").first().textContent().catch(() => "");
    return Number(metrics?.match(/\d+/)?.[0] ?? 0);
  }).toBeGreaterThan(0);
  const saveButton = page.getByRole("button", { name: /待保存|保存中|已保存|重试/ }).first();
  const saveText = await saveButton.textContent().catch(() => "");
  if (/待保存|重试/.test(saveText || "")) {
    await saveButton.click();
  }
  await expect(saveButton).toContainText(/已保存/, { timeout: 10000 });
  await page.getByRole("link", { name: /文档|docs/i }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

async function searchDocs(page: Page, keyword: string) {
  const searchInput = page.getByPlaceholder(/搜索|search/i).first();
  await searchInput.fill(keyword);
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/\/admin\/docs\?q=/, { timeout: 5000 });
}

test.describe("全文搜索测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("TC-SEARCH-001: 基础搜索 - 标题搜索", async ({ page }) => {
    const uniqueTitle = `标题搜索_${Date.now()}`;
    await createSearchDoc(page, uniqueTitle, "标题搜索正文");
    await searchDocs(page, uniqueTitle);
    await expect(page.locator(".doc-list-page__row").filter({ hasText: uniqueTitle })).toBeVisible({ timeout: 10000 });
  });

  test("TC-SEARCH-002: 内容搜索 - 全文匹配", async ({ page }) => {
    const uniqueKeyword = `搜索测试关键词_${Date.now()}`;
    await createSearchDoc(page, `全文搜索文档_${Date.now()}`, `这是一段包含 ${uniqueKeyword} 的测试内容`);
    await searchDocs(page, uniqueKeyword);
    await expect(page.locator(".doc-list-page__row").first()).toBeVisible({ timeout: 10000 });
  });

  test("TC-SEARCH-003: 空搜索结果处理", async ({ page }) => {
    await searchDocs(page, `不存在的关键词_${Date.now()}_xyz`);
    await expect(page.getByText(/没有找到文档|没有找到包含/).first()).toBeVisible({ timeout: 10000 });
  });

  test("TC-SEARCH-004: 搜索性能基准 < 2s", async ({ page }) => {
    const uniqueTitle = `性能搜索_${Date.now()}`;
    await createSearchDoc(page, uniqueTitle, "性能搜索正文");

    const startTime = Date.now();
    await searchDocs(page, uniqueTitle);
    await expect(page.locator(".doc-list-page__row").filter({ hasText: uniqueTitle })).toBeVisible({ timeout: 10000 });
    const searchDuration = Date.now() - startTime;

    console.log(`搜索响应时间: ${searchDuration}ms`);
    expect(searchDuration).toBeLessThan(2000);
  });

  test("TC-SEARCH-005: 搜索结果分页", async ({ page }) => {
    await searchDocs(page, "文档");
    await expect(page.locator(".doc-list-page__table, .empty-state").first()).toBeVisible({ timeout: 10000 });

    const nextButton = page.getByRole("button", { name: /下一页|next/i }).first();
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      await expect(page.locator(".doc-list-page__table, .empty-state").first()).toBeVisible({ timeout: 10000 });
    } else {
      test.skip(true, "搜索结果不足一页，无需分页");
    }
  });
});
