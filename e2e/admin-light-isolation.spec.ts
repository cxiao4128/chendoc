import { expect, test } from "@playwright/test";

test("深色偏好不会污染固定浅色工作台", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("chendoc_theme", "dark"));
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");
  await page.getByRole("button", { name: "进入陈书" }).click();
  await expect(page).toHaveURL(/\/admin\/docs$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const workspaceColors = await page.locator(".admin-layout").evaluate((layout) => {
    const layoutStyle = getComputedStyle(layout);
    const heading = document.querySelector<HTMLElement>(".doc-list-page h1");
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      ink: layoutStyle.getPropertyValue("--cd-ink").trim(),
      paperSoft: layoutStyle.getPropertyValue("--cd-paper-soft").trim(),
      heading: heading ? getComputedStyle(heading).color : "",
      scrollbarTrack: rootStyle.getPropertyValue("--cd-scrollbar-track").trim(),
      scrollbarThumb: rootStyle.getPropertyValue("--cd-scrollbar-thumb").trim()
    };
  });

  expect(workspaceColors).toEqual({
    ink: "#16213d",
    paperSoft: "#f7f8ff",
    heading: "rgb(22, 33, 61)",
    scrollbarTrack: "#f1f3f9",
    scrollbarThumb: "#c8cdec"
  });

  await page.locator(".doc-list-page__actions .cd-button.primary").click();
  await expect(page).toHaveURL(/\/admin\/docs\/[A-Za-z0-9]+$/);
  const shareButton = page.getByRole("button", { name: "分享", exact: true });
  await shareButton.click();

  const summary = page.locator(".doc-editor-page__share-summary");
  await expect(summary).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(shareButton).toHaveCSS("background-color", "rgb(37, 99, 235)");
  const shareColors = await summary.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
    title: getComputedStyle(element.querySelector("strong")!).color
  }));

  expect(shareColors).toEqual({
    background: "rgb(247, 248, 255)",
    text: "rgb(101, 113, 145)",
    title: "rgb(22, 33, 61)"
  });
});
