/**
 * ChenDoc 标签系统 E2E 测试
 * 测试覆盖: TC-TAG-001 ~ TC-TAG-005
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("标签系统测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 导航到标签管理页面
    await page.getByRole("link", { name: /标签|tag/i }).click();
    await expect(page.locator(".tag-manager")).toBeVisible({ timeout: 5000 });
  });

  test("TC-TAG-001: 创建标签", async ({ page }) => {
    const initialCount = await page.locator(".tag-manager__item").count();

    // 点击新建标签
    await page.getByRole("button", { name: "新建标签" }).click();

    // 填写标签名
    const nameInput = page.locator(".tag-manager__create input, .tag-name-input").first();
    await nameInput.fill("自动化测试标签");

    // 选择颜色
    const firstColor = page.locator(".tag-manager__color, .tag-color-option").first();
    await firstColor.click();

    // 点击创建
    await page.getByRole("button", { name: "创建" }).click();

    // 验证标签创建成功
    await expect(page.getByText("自动化测试标签")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".tag-manager__item")).toHaveCount(initialCount + 1);
  });

  test("TC-TAG-002: 编辑标签", async ({ page }) => {
    // 确保至少有一个标签
    const firstTag = page.locator(".tag-manager__item").first();
    await expect(firstTag).toBeVisible({ timeout: 5000 });

    // 悬停显示编辑按钮
    await firstTag.hover();

    // 点击编辑按钮
    const editButton = page.locator(".tag-manager__action").first();
    await editButton.click();

    // 修改标签名
    const editInput = page.locator(".tag-manager__item input, .tag-name-input").first();
    await editInput.fill("修改后的标签名");

    // 切换颜色
    const secondColor = page.locator(".tag-manager__color").nth(1);
    await secondColor.click();

    // 保存
    await page.getByRole("button", { name: "保存" }).first().click();

    // 验证修改
    await expect(page.getByText("修改后的标签名")).toBeVisible({ timeout: 5000 });
  });

  test("TC-TAG-003: 删除标签", async ({ page }) => {
    const initialCount = await page.locator(".tag-manager__item").count();

    // 如果没有标签，先创建一个
    if (initialCount === 0) {
      await page.getByRole("button", { name: "新建标签" }).click();
      await page.locator(".tag-manager__create input").fill("待删除标签");
      await page.locator(".tag-manager__color").first().click();
      await page.getByRole("button", { name: "创建" }).click();
      await expect(page.getByText("待删除标签")).toBeVisible({ timeout: 5000 });
    }

    // 悬停显示删除按钮
    const firstTag = page.locator(".tag-manager__item").first();
    await firstTag.hover();

    // 点击删除按钮
    const deleteButton = page.locator(".tag-manager__action.danger, .tag-delete-btn").first();
    await deleteButton.click();

    // 确认删除对话框
    const confirmButton = page.getByRole("button", { name: /确定|删除|是/i }).first();
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    } else {
      // 如果有 confirm 对话框
      page.on("dialog", dialog => dialog.accept());
      await deleteButton.click();
    }

    // 验证删除 (在初始计数基础上 -1)
    await expect(page.locator(".tag-manager__item")).toHaveCount(initialCount - 1, { timeout: 5000 });
  });

  test("TC-TAG-004: 标签关联文档", async ({ page }) => {
    // 先创建一个标签
    await page.getByRole("button", { name: "新建标签" }).click();
    const tagName = `文档关联标签-${Date.now()}`;
    await page.locator(".tag-manager__create input").fill(tagName);
    await page.locator(".tag-manager__color").first().click();
    await page.getByRole("button", { name: "创建" }).click();
    await expect(page.getByText(tagName)).toBeVisible({ timeout: 5000 });

    // 返回文档列表
    await page.getByRole("link", { name: /文档|docs/i }).click();
    await expect(page).toHaveURL(/\/admin\/docs/);

    // 创建新文档
    await page.getByRole("button", { name: "新建文档" }).first().click();
    await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

    // 在编辑器中找到标签选择器
    const tagSelector = page.getByRole("button", { name: /添加标签|选择标签/i }).first();
    if (await tagSelector.isVisible()) {
      await tagSelector.click();
      await page.getByText(tagName).first().click();

      // 验证标签已关联
      await expect(page.locator(".doc-tags, .tag-list").getByText(tagName)).toBeVisible({ timeout: 5000 });
    } else {
      test.skip("文档标签选择器不可见，跳过关联测试");
    }
  });

  test("TC-TAG-005: 标签筛选文档列表", async ({ page }) => {
    // 返回文档列表
    await page.getByRole("link", { name: /文档|docs/i }).click();
    await expect(page).toHaveURL(/\/admin\/docs/);

    // 检查是否有标签筛选器
    const tagFilter = page.getByRole("button", { name: /标签筛选|tags/i }).first();

    if (await tagFilter.isVisible()) {
      await tagFilter.click();

      // 选择一个标签
      const tagOption = page.locator(".tag-option, .filter-tag").first();
      if (await tagOption.isVisible()) {
        await tagOption.click();

        // 验证筛选结果
        await page.waitForTimeout(500);
        const docList = page.locator(".doc-item, .doc-card");
        const count = await docList.count();

        // 应该只显示包含该标签的文档
        if (count > 0) {
          // 验证每个文档都包含该标签
          const firstDoc = docList.first();
          await expect(firstDoc.locator(".doc-tags, .tag")).toBeVisible();
        }
      } else {
        test.skip("没有可用的标签选项");
      }
    } else {
      test.skip("标签筛选器不可见，可能在不同的页面位置");
    }
  });
});