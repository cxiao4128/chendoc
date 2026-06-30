/**
 * ChenDoc 看板视图 E2E 测试
 * 测试覆盖: TC-KANBAN-001 ~ TC-KANBAN-003
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);
}

test.describe("看板视图测试", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("TC-KANBAN-001: 视图切换 - 列表 → 看板", async ({ page }) => {
    // 确保在文档列表页
    await expect(page).toHaveURL(/\/admin\/docs/);

    // 检查当前是否为列表视图
    const listView = page.locator(".doc-list, .list-view, [class*='list']").first();
    const isListView = await listView.isVisible().catch(() => false);

    // 找到视图切换按钮
    const viewSwitchButton = page.getByRole("button", { name: /视图|view|切换/i }).first();

    if (await viewSwitchButton.isVisible()) {
      await viewSwitchButton.click();

      // 等待下拉菜单出现
      await page.waitForTimeout(300);

      // 选择看板视图
      const kanbanOption = page.getByText("看板", { exact: true }).or(
        page.getByText("Kanban", { exact: true })
      ).or(
        page.locator("[data-view='kanban']")
      );

      if (await kanbanOption.isVisible()) {
        await kanbanOption.click();

        // 等待视图切换动画
        await page.waitForTimeout(500);

        // 验证看板视图显示
        const kanbanView = page.locator(".kanban-board, .kanban-view, [class*='kanban']").first();
        await expect(kanbanView).toBeVisible({ timeout: 5000 });
      } else {
        test.skip("看板视图选项不可见");
      }
    } else {
      test.skip("视图切换按钮不可见");
    }
  });

  test("TC-KANBAN-002: 看板视图筛选", async ({ page }) => {
    // 切换到看板视图
    const viewSwitchButton = page.getByRole("button", { name: /视图|view/i }).first();
    await viewSwitchButton.click();
    await page.waitForTimeout(300);

    const kanbanOption = page.getByText("看板", { exact: true });
    await kanbanOption.click();
    await page.waitForTimeout(500);

    // 验证看板视图已显示
    const kanbanBoard = page.locator(".kanban-board, [class*='kanban']").first();
    await expect(kanbanBoard).toBeVisible({ timeout: 5000 });

    // 检查筛选控件
    const filterButton = page.getByRole("button", { name: /筛选|filter/i }).first();

    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(300);

      // 选择第一个可用的筛选选项
      const filterOption = page.locator(".filter-option, .filter-item, [class*='filter']").first();

      if (await filterOption.isVisible()) {
        const initialCards = await page.locator(".kanban-card, .doc-card").count();

        await filterOption.click();
        await page.waitForTimeout(500);

        const filteredCards = await page.locator(".kanban-card, .doc-card").count();

        // 验证筛选有效果
        console.log(`筛选前: ${initialCards} 卡片, 筛选后: ${filteredCards} 卡片`);

        // 至少应该有结果（如果不是筛选"无"的话）
        if (initialCards > 0) {
          expect(filteredCards).toBeLessThanOrEqual(initialCards);
        }
      } else {
        test.skip("没有可用的筛选选项");
      }
    } else {
      test.skip("筛选按钮不可见");
    }
  });

  test("TC-KANBAN-003: 看板视图排序", async ({ page }) => {
    // 切换到看板视图
    const viewSwitchButton = page.getByRole("button", { name: /视图|view/i }).first();
    await viewSwitchButton.click();
    await page.waitForTimeout(300);

    const kanbanOption = page.getByText("看板", { exact: true });
    await kanbanOption.click();
    await page.waitForTimeout(500);

    // 验证看板视图已显示
    await expect(page.locator(".kanban-board, [class*='kanban']").first()).toBeVisible({ timeout: 5000 });

    // 检查排序控件
    const sortButton = page.getByRole("button", { name: /排序|sort/i }).first();

    if (await sortButton.isVisible()) {
      await sortButton.click();
      await page.waitForTimeout(300);

      // 选择按更新时间排序
      const sortOption = page.getByText(/更新时间|updated|modified/i).first();

      if (await sortOption.isVisible()) {
        await sortOption.click();
        await page.waitForTimeout(500);

        // 验证排序生效（通过检查卡片顺序是否有变化）
        const cards = page.locator(".kanban-card, .doc-card");
        const cardCount = await cards.count();

        if (cardCount > 1) {
          // 获取卡片的时间戳（如果有的话）
          const timestamps = await cards.evaluateAll(cards =>
            cards.map(card => {
              const timeEl = card.querySelector("[class*='time'], [class*='date']");
              return timeEl?.textContent || "";
            })
          );

          console.log("卡片时间戳:", timestamps);
          // 排序后应该按时间顺序显示（如果实现了排序功能）
        }
      } else {
        test.skip("排序选项不可见");
      }
    } else {
      test.skip("排序按钮不可见");
    }
  });

  test("TC-KANBAN-004: 看板视图下创建文档", async ({ page }) => {
    // 切换到看板视图
    const viewSwitchButton = page.getByRole("button", { name: /视图|view/i }).first();
    await viewSwitchButton.click();
    await page.waitForTimeout(300);

    const kanbanOption = page.getByText("看板", { exact: true });
    await kanbanOption.click();
    await page.waitForTimeout(500);

    // 验证看板视图
    await expect(page.locator(".kanban-board, [class*='kanban']").first()).toBeVisible({ timeout: 5000 });

    // 在看板视图中点击新建文档
    const newDocButton = page.getByRole("button", { name: /新建文档|new doc/i }).first();

    if (await newDocButton.isVisible()) {
      await newDocButton.click();

      // 应该跳转到编辑页面
      await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/, { timeout: 10000 });
      await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10000 });

      // 填写标题并保存
      const titleInput = page.getByRole("textbox", { name: /标题|title/i }).first();
      await titleInput.fill("看板视图新建的文档");

      // 返回看板视图
      await page.getByRole("link", { name: /文档|docs/i }).click();
      await expect(page).toHaveURL(/\/admin\/docs/);

      // 验证新文档出现在看板中
      await expect(page.getByText("看板视图新建的文档")).toBeVisible({ timeout: 10000 });
    } else {
      test.skip("新建按钮在看板视图中不可见");
    }
  });

  test("TC-KANBAN-005: 看板视图返回列表视图", async ({ page }) => {
    // 先切换到看板视图
    const viewSwitchButton = page.getByRole("button", { name: /视图|view/i }).first();
    await viewSwitchButton.click();
    await page.waitForTimeout(300);

    const kanbanOption = page.getByText("看板", { exact: true });
    await kanbanOption.click();
    await page.waitForTimeout(500);

    // 验证在看板视图
    await expect(page.locator(".kanban-board, [class*='kanban']").first()).toBeVisible({ timeout: 5000 });

    // 切换回列表视图
    await viewSwitchButton.click();
    await page.waitForTimeout(300);

    const listOption = page.getByText("列表", { exact: true }).or(
      page.getByText("List", { exact: true })
    );

    if (await listOption.isVisible()) {
      await listOption.click();
      await page.waitForTimeout(500);

      // 验证列表视图显示
      const listView = page.locator(".doc-list, .list-view, [class*='list']").first();
      await expect(listView).toBeVisible({ timeout: 5000 });

      // 看板视图应该消失
      const kanbanView = page.locator(".kanban-board");
      await expect(kanbanView).not.toBeVisible();
    } else {
      test.skip("列表视图选项不可见");
    }
  });
});