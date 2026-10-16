import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E runs against the BUILT single file over file:// (run `vp build` first).
// CI installs Playwright's own browsers. Sandboxes that cannot run `playwright install` reuse a
// preinstalled Chromium: PW_CHROMIUM_PATH, or /opt/pw-browsers/chromium when it exists outside CI.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (!process.env.CI && existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

const chromium = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} },
};

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  // With a borrowed Chromium there are no Firefox or WebKit builds to run.
  projects: executablePath
    ? [chromium]
    : [
        chromium,
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ],
});
