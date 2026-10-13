import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL },
  // Without BASE_URL, start the app (dev login on, for tests only).
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: true, env: { BUGBOARD_DEV_LOGIN: "1" } },
});
