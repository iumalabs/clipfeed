// Task 50: installs a fixed browser clock BEFORE navigation, so the SPA's
// local-calendar-day section bucketing (today/yesterday/earlier — see
// packages/web/src/lib/dateGrouping.ts) always agrees with the timestamps
// scripts/e2e/seed-sql.ts computed relative to this exact same instant. Never
// the real wall clock — this is what makes the pagination flow deterministic
// regardless of what day/time the suite actually runs.
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixedNowPath = fileURLToPath(new URL("./fixed-now.json", import.meta.url));
const fixedNow = JSON.parse(readFileSync(fixedNowPath, "utf8")) as { fixedNowIso: string };

export async function installFixedClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(fixedNow.fixedNowIso) });
}
