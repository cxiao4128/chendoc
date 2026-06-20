import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test("登录、编辑、自动保存、分享、退出", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "新建文档" }).first().click();
  await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

  const title = page.getByRole("textbox", { name: "文档标题" }).first();
  await title.fill("Playwright 自动保存文档");
  await expect(page.getByText(/已保存|自动保存/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "分享" }).first().click();
  const shareToggle = page.getByRole("checkbox", { name: "公开分享" }).first();
  await shareToggle.check();
  await expect(page.getByText(/公开分享中|等待审核|分享链接/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "退出登录" }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test("公开表单提交", async ({ page, context }) => {
  await login(page);
  await page.getByRole("link", { name: "收集表" }).click();
  await page.getByRole("button", { name: "新建表单" }).first().click();
  await page.locator(".form-canvas__title-input").fill("Playwright 公开表单");
  await page.getByText("问答题", { exact: true }).first().click();
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("收集中")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "编辑" }).click();

  const [publicPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "查看表单" }).click()
  ]);
  await publicPage.waitForLoadState("domcontentloaded");
  await publicPage.locator("input[type='text']").first().fill("浏览器提交成功");
  await publicPage.getByRole("button", { name: "提交" }).click();
  await expect(publicPage.getByRole("heading", { name: "提交成功" })).toBeVisible();
});
