import { defineConfig, devices } from "@playwright/test";

// Task 50: all 5 specs share ONE seeded worker + D1 instance (see
// scripts/e2e/run.ts) — `workers: 1` keeps them fully serial so one spec's
// mid-run DB mutation (the pagination spec's poll-merge check) can never
// race another spec's assertions. Deliberately zero retries: a flaky-passing
// test here would mask a real regression, and the task's own guardrail says
// to report an unreliable test as a gap rather than paper over it with
// retries.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8799",
    headless: true,
    viewport: { width: 1000, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
