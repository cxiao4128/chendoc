import { expect, test } from "@playwright/test";

test("登录并进入文档工作台", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: "陈书" })).toBeVisible();

  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();

  await expect(page).toHaveURL(/\/admin\/docs$/, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText("请求失败");
});
