import { expect, test } from "@playwright/test";

const rgb = (value: string) => value.replace(/\s+/g, "");

test.describe("登录页图三视觉回归", () => {
  test("1272×755 使用紧凑桌面比例", async ({ page }) => {
    await page.setViewportSize({ width: 1272, height: 755 });
    await page.goto("/login", { waitUntil: "networkidle" });

    const card = page.locator(".auth-card");
    const input = page.locator(".auth-input").first();
    const button = page.locator(".auth-submit");
    const box = await card.boundingBox();
    const inputBox = await input.boundingBox();
    const buttonBox = await button.boundingBox();

    expect(box).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(box!.width).toBeCloseTo(312, 0);
    expect(Math.abs(box!.x + box!.width + 114 - 1272)).toBeLessThanOrEqual(2);
    expect(Math.abs(box!.y + box!.height / 2 - 755 / 2)).toBeLessThanOrEqual(2);
    expect(inputBox!.width).toBeCloseTo(260, 0);
    expect(inputBox!.height).toBeCloseTo(34, 0);
    expect(buttonBox!.width).toBeCloseTo(260, 0);
    expect(buttonBox!.height).toBeCloseTo(40, 0);

    await expect(page.locator(".auth-atmosphere")).toHaveCSS("background-image", "none");
    expect(rgb(await page.locator(".auth-hero__copy h1").evaluate((node) => getComputedStyle(node).color))).toBe("rgb(142,135,196)");
    expect(rgb(await page.locator(".auth-heading__title").evaluate((node) => getComputedStyle(node).color))).toBe("rgb(129,121,184)");
    expect(rgb(await button.evaluate((node) => getComputedStyle(node).backgroundColor))).toBe("rgb(49,95,206)");
  });

  test("390×844 保留手机触控尺寸且不溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login", { waitUntil: "networkidle" });

    const cardBox = await page.locator(".auth-card").boundingBox();
    const inputBox = await page.locator(".auth-input").first().boundingBox();
    const buttonBox = await page.locator(".auth-submit").boundingBox();

    expect(cardBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(16);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(374);
    expect(inputBox!.height).toBeGreaterThanOrEqual(48);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
