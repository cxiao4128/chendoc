import { defineConfig, devices } from "playwright/test";

const port = 8996;

/**
 * ChenDoc E2E Playwright 配置
 *
 * 测试场景:
 * - chromium: 桌面端 Chrome (1280x720)
 * - Mobile Chrome: 移动端 Chrome (375x667)
 * - Mobile Safari: iPhone 12 模拟 (390x844)
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        // 复用登录逻辑，但保持移动端视口
      }
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 12"],
      }
    },
    {
      name: "mobile-responsive-390",
      use: {
        ...devices["iPhone 12 Pro Max"],
      }
    }
  ]
});
