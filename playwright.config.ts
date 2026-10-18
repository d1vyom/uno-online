import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 90_000,
  expect: { timeout: 12_000 },
  use: { baseURL: "http://localhost:3100", headless: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false, timeout: 120_000,
    env: { UNO_STORE: "memory", UNO_E2E: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
