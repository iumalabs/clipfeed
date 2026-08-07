import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Task 60 regression: wrangler.toml's [assets] not_found_handling still
// serves the SPA shell for ANY unrecognized pathname (so the URL bar keeps
// showing it, no server round-trip) — without the SPA's own check
// (lib/feed/deepLink.ts's isUnknownPath), it used to silently fall back to
// rendering the ordinary feed with no indication the URL itself was wrong.
// Zero E2E coverage existed for this before this spec — deep-link.spec.ts
// only covers the KNOWN "/a/:id" shape, never the unknown-path branch.
test("an unrecognized path shows the not-found view, and its link returns to the normal feed", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/a/");

  await expect(page.locator(".empty-state-title")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);

  await page.locator(".empty-state-reset").click();
  await expect(page.locator(".empty-state-title")).not.toBeAttached();
  await expect(page).toHaveURL(/\/$/);
});

test("a completely unrelated path also shows the not-found view", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/some/unknown/route");

  await expect(page.locator(".empty-state-title")).toBeVisible();
});
