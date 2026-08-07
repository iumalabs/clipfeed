import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Task 62 regression: the sidebar's tag/source pill counts used to be
// computed CLIENT-SIDE over whatever articles happened to already be loaded
// (Today+Yesterday by default), so an unfiltered view showed something
// closer to "today's tag counts" than a true all-time total. Fixed by
// GET /api/articles/facets (see packages/api/src/articles/db.ts's
// getArticleFacets) — this test proves the pill shows the TRUE total
// without the reader ever expanding "Earlier".
//
// Fixture (seed-sql.ts's facetsRows): 2 rows in "today" (always loaded by
// the initial-load loop) + 5 rows well into "earlier" (never loaded until
// that section is expanded) = 7 total. If the sidebar were still computing
// counts client-side, the pill would read "(2)" here — this test would have
// caught the exact incident the fix addresses.
const FACETS_TAG = "e2e-facets";
const FACETS_SOURCE = "e2e-facets.example.com";
const FACETS_TOTAL_COUNT = 7;

test("tag/source sidebar pills show the true all-time count, not just the currently-loaded window", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  // Confirm only the "today" half of this fixture group is actually loaded
  // yet — "Earlier" is deliberately never expanded in this test.
  await expect(page.locator(`[data-article-id="e2e-facets-today-0"]`)).toBeVisible();
  await expect(page.locator(`[data-article-id="e2e-facets-earlier-0"]`)).not.toBeAttached();

  const tagPill = page.locator(".sidebar .pill", { hasText: new RegExp(`^${FACETS_TAG} \\(`) });
  await expect(tagPill).toHaveText(`${FACETS_TAG} (${FACETS_TOTAL_COUNT})`);

  const sourcePill = page.locator(".sidebar .source-item", { hasText: FACETS_SOURCE });
  await expect(sourcePill.locator(".source-count")).toHaveText(String(FACETS_TOTAL_COUNT));
});

test("with the tag filter active, the source facet still counts across all 7 (respects tag, excludes only its own dimension)", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  const tagPill = page.locator(".sidebar .pill", { hasText: new RegExp(`^${FACETS_TAG} \\(`) });
  await tagPill.click();
  await expect(page.locator(".filter-chip")).toContainText(FACETS_TAG);

  const sourcePill = page.locator(".sidebar .source-item", { hasText: FACETS_SOURCE });
  await expect(sourcePill.locator(".source-count")).toHaveText(String(FACETS_TOTAL_COUNT));
});
