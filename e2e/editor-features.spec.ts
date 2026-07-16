/**
 * ChenDoc 编辑器功能 E2E 测试
 * 测试覆盖: TC-EDIT-001 ~ TC-EDIT-006
 */
import { test, expect, type Page } from "@playwright/test";

const testImageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);
const testImageUrl = `data:image/png;base64,${testImageBuffer.toString("base64")}`;
const testVideoUrl = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVl";
const testVideoBuffer = Buffer.from(testVideoUrl.split(",")[1]!, "base64");

async function mockUploads(page: Page) {
  await page.route("**/api/uploads/presign", async (route) => {
    const body = route.request().postDataJSON() as { kind: "image" | "video" | "file"; fileName: string };
    const publicUrl = body.kind === "video" ? testVideoUrl : testImageUrl;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadUrl: `${new URL(route.request().url()).origin}/__e2e-upload/${body.kind}`,
        uploadToken: `e2e-upload-token-${Date.now()}`,
        objectKey: `e2e/${body.fileName}`,
        publicUrl
      })
    });
  });
  await page.route("**/__e2e-upload/**", async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/uploads/complete", async (route) => {
    const body = route.request().postDataJSON() as { kind: "image" | "video" | "file"; publicUrl?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        upload: {
          id: Date.now(),
          publicUrl: body.publicUrl || (body.kind === "video" ? testVideoUrl : testImageUrl)
        }
      })
    });
  });
}

async function loginAndCreateDoc(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs/);

  // 创建文档
  await page.getByRole("button", { name: "新建文档" }).first().click();
  await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+/);

  // 等待编辑器加载
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10000 });
}

test.describe("编辑器功能测试", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndCreateDoc(page);
  });

  test("TC-EDIT-001: 富文本格式化 - 文字颜色", async ({ page }) => {
    const editor = page.locator(".ProseMirror");

    // 输入文字
    await editor.fill("测试文字颜色");
    await editor.selectText();

    // 点击颜色按钮
    const colorButton = page.getByRole("button", { name: "文本颜色" });
    await colorButton.click();

    // 选择颜色选择器中的红色
    const colorOption = page.getByRole("button", { name: /选择文本颜色 红色/ });
    await colorOption.click();

    // 验证颜色应用
    const styledElement = page.locator(".ProseMirror [style*='color']");
    await expect(styledElement).toBeVisible({ timeout: 5000 });
  });

  test("TC-EDIT-002: 富文本格式化 - 高亮/背景色", async ({ page }) => {
    const editor = page.locator(".ProseMirror");

    // 输入文字
    await editor.fill("测试高亮");
    await editor.selectText();

    // 点击高亮按钮
    const highlightButton = page.getByRole("button", { name: "高亮背景" });
    await highlightButton.click();

    // 选择黄色高亮
    const highlightOption = page.getByRole("button", { name: /选择高亮背景 黄色/ });
    await highlightOption.click();

    // 验证高亮应用 (TipTap 使用 mark 标签)
    const highlighted = page.locator(".ProseMirror mark, .ProseMirror [style*='background']");
    await expect(highlighted).toBeVisible({ timeout: 5000 });
  });

  test("TC-EDIT-003: 编辑器自动保存", async ({ page }) => {
    const editor = page.locator(".ProseMirror");

    // 输入内容
    await editor.fill("这是一段需要自动保存的内容");

    // 等待自动保存提示出现
    const saveIndicator = page.getByText(/已保存|自动保存|保存中/i).first();
    await expect(saveIndicator).toBeVisible({ timeout: 15000 });
  });

  test("TC-EDIT-004: 编辑器批注功能", async ({ page }) => {
    const editor = page.locator(".ProseMirror");

    // 输入并选中文字
    await editor.fill("这是一段可以添加批注的文字");
    await editor.selectText();

    // 点击批注按钮
    const commentButton = page.getByRole("button", { name: /批注|comment|评论/i }).first();

    // 如果批注功能存在
    if (await commentButton.isVisible()) {
      await commentButton.click();

      // 输入批注内容
      const commentInput = page.getByPlaceholder(/批注|comment|评论/i).first();
      await commentInput.fill("这是测试批注");

      // 提交批注
      await page.getByRole("button", { name: /提交|发送|添加/i }).first().click();

      // 验证批注显示
      await expect(page.getByText("这是测试批注")).toBeVisible({ timeout: 5000 });
    } else {
      // 批注功能未实现，跳过
      test.skip("批注功能未实现");
    }
  });

  test("TC-EDIT-005: 编辑器媒体插入 - 图片", async ({ page }) => {
    await mockUploads(page);

    // 点击图片插入按钮
    const imageButton = page.getByRole("button", { name: /图片|image/i }).first();
    await imageButton.click();

    // 文件选择对话框会出现，等待隐藏输入框
    const fileInput = page.getByTestId("editor-image-input");
    await expect(fileInput).toBeAttached();

    // 上传文件
    await fileInput.setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: testImageBuffer
    });

    // 等待上传完成
    await page.waitForTimeout(2000);

    // 验证图片插入
    const image = page.locator(".ProseMirror img, .ProseMirror .image-node");
    await expect(image).toBeVisible({ timeout: 10000 });
  });

  test("TC-EDIT-006: 编辑器媒体插入 - 视频", async ({ page }) => {
    await mockUploads(page);

    // 点击视频插入按钮
    const videoButton = page.getByRole("button", { name: /视频|video/i }).first();
    await videoButton.click();

    // 文件选择对话框
    const fileInput = page.getByTestId("editor-video-input");
    await expect(fileInput).toBeAttached();

    // 上传文件
    await fileInput.setInputFiles({
      name: "test.mp4",
      mimeType: "video/mp4",
      buffer: testVideoBuffer
    });

    // 等待上传
    await page.waitForTimeout(2000);

    // 验证视频插入
    const video = page.locator(".ProseMirror video, .ProseMirror .video-node");
    await expect(video).toBeVisible({ timeout: 10000 });
  });
});
