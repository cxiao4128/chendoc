import { expect, test } from "@playwright/test";

test.skip(
  process.env.CHENDOC_E2E_PRODUCTION_GATEWAY !== "true",
  "仅在生产网关回归模式下运行"
);

test("生产加密网关可以完成登录", async ({ page }) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console:${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/crypto/") || response.url().endsWith("/api/gateway")) {
      diagnostics.push(`response:${response.status()}:${new URL(response.url()).pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/")) diagnostics.push(`failed:${request.url()}:${request.failure()?.errorText || "unknown"}`);
  });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("用户名").fill("e2eadmin");
  await page.getByPlaceholder("密码").fill("E2e!Password123");

  const gatewayResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/gateway") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "进入陈书" }).click();

  const result = await Promise.race([
    gatewayResponse.then((response) => ({ response })),
    page.getByRole("alert").waitFor({ state: "visible" }).then(async () => ({
      error: await page.getByRole("alert").innerText()
    }))
  ]);
  if ("error" in result) throw new Error(`${result.error}; ${diagnostics.join(" | ")}`);

  expect(result.response.ok()).toBe(true);
  await expect(page).toHaveURL(/\/admin\/docs$/, { timeout: 30_000 });
});
