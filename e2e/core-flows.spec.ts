import { expect, test, type Page } from "playwright/test";

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
  await expect.poll(async () => {
    const left = page.locator(".doc-editor-page__left");
    if (await left.count() === 0) return true;
    return await left.locator(".doc-tree__item, .doc-editor-page__toc a").count() > 0;
  }).toBe(true);
  await expect(page.getByRole("button", { name: "删除文档" })).not.toBeVisible();
  await page.getByRole("button", { name: "更多操作" }).click();
  await expect(page.getByRole("button", { name: "删除文档" })).toBeVisible();
  await page.getByRole("button", { name: "更多操作" }).click();

  const title = page.getByRole("textbox", { name: "文档标题" }).first();
  await title.fill("Playwright 自动保存文档");
  await expect(page.getByText(/已保存|自动保存/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "分享" }).first().click();
  const shareToggle = page.getByRole("checkbox", { name: "公开分享" }).first();
  await shareToggle.check();
  await expect(page.getByText(/公开分享中|等待审核|分享链接/).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "当前用户" }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("公开表单提交", async ({ page, context }) => {
  await login(page);
  await page.getByRole("link", { name: "收集表" }).click();
  await page.getByRole("button", { name: "新建表单" }).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "手机端表单编辑步骤" })).toBeVisible();
  await page.locator(".form-canvas__title-input").fill("Playwright 公开表单");
  await page.getByRole("button", { name: "选择题型" }).click();
  await page.getByText("单行文本", { exact: true }).first().click();
  await expect(page.getByText("字段属性", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.locator(".form-canvas__inner")).toBeVisible();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/forms\/\d+/, { timeout: 15_000 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".form-canvas__title-input")).toHaveValue("Playwright 公开表单", { timeout: 15_000 });
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("收集中").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "编辑" }).click();

  const [publicPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "查看表单" }).click()
  ]);
  await publicPage.waitForLoadState("domcontentloaded");
  await publicPage.locator("input[type='text']").first().fill("浏览器提交成功");
  await publicPage.getByRole("button", { name: "提交" }).click();
  await expect(publicPage.getByRole("heading", { name: "提交成功" })).toBeVisible();
  await expect(publicPage.locator("#data-list").getByText("单行文本", { exact: true })).toBeVisible();
});
