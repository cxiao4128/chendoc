/**
 * ChenDoc 看板视图 E2E 测试
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

async function switchToKanban(page: Page) {
  await page.locator("[data-view='kanban']").click();
  await expect(page.locator(".kanban-board")).toBeVisible({ timeout: 5000 });
}

async function switchToList(page: Page) {
  await page.locator("[data-view='list']").click();
  await expect(page.locator(".doc-list-page__table, .empty-state").first()).toBeVisible({ timeout: 5000 });
}

test.describe("看板视图测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("TC-KANBAN-001: 视图切换 - 列表 → 看板", async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/docs/);
    await switchToKanban(page);
  });

  test("TC-KANBAN-002: 看板视图分组", async ({ page }) => {
    await switchToKanban(page);
    await page.getByLabel("看板分组").selectOption("tag");
    await expect(page.locator(".kanban-board")).toBeVisible({ timeout: 5000 });
  });

  test("TC-KANBAN-003: 看板视图排序", async ({ page }) => {
    await switchToKanban(page);
    await page.getByRole("button", { name: /按更新时间|按创建时间|按标题/ }).click();
    await expect(page.locator(".kanban-board")).toBeVisible({ timeout: 5000 });
  });

  test("TC-KANBAN-004: 看板视图下创建文档", async ({ page }) => {
    await switchToKanban(page);
    await page.getByRole("button", { name: /新建文档/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/, { timeout: 10000 });
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10000 });

    await page.getByRole("textbox", { name: /标题|title/i }).first().fill("看板视图新建的文档");
    await expect(page.getByText(/已保存|自动保存/).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /文档|docs/i }).click();
    await expect(page).toHaveURL(/\/admin\/docs/);
    await switchToKanban(page);
    await expect(page.getByText("看板视图新建的文档")).toBeVisible({ timeout: 10000 });
  });

  test("TC-KANBAN-005: 看板视图返回列表视图", async ({ page }) => {
    await switchToKanban(page);
    await switchToList(page);
    await expect(page.locator(".kanban-board")).not.toBeVisible();
  });
});
