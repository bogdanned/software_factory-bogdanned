import { defineConfig } from "@playwright/test";

// Re-runs the QA agent's checks against the app the workflow started.
// channel "chrome": the Chrome already on the runner, no browser download.
export default defineConfig({
  testDir: "../qa-out/checks",
  use: { baseURL: "http://localhost:3000", channel: "chrome" },
  retries: 1,
});