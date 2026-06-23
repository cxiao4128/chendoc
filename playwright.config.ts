import { defineConfig, devices } from "playwright/test";

const port = 8996;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
