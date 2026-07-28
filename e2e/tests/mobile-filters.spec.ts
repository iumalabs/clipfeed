import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Task 54: on mobile the tag/source sidebar used to stack ABOVE the feed
// (a "wall of pills" the user had to scroll past to reach the first
// article). It's replaced by a "Filters" button in the header that opens a
// bottom sheet — see packages/web/components/FilterSheet.tsx. Desktop's
// right-hand sidebar must stay exactly as it was; only the mobile
// presentation changed (the filter state/reducer is shared, see
// lib/feed/filterState.ts).
//
// Reuses the pagination fixture group's own tag (seed-sql.ts's
// PAGINATION_TAG, duplicated here as a plain string the same way
// pagination.spec.ts does) rather than seeding a new group — this test
// doesn't need its own dataset, just an existing tag to pick.
const PAGINATION_TAG = "e2e-pagination";

test.describe("mobile filters bottom sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the feed starts immediately under the header — no stacked sidebar wall of pills", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".filter-row-mobile")).toHaveCount(0);
    await expect(page.locator(".filters-button")).toBeVisible();
    // The main column's first meaningful content is a date section, not a
    // row of filter pills — Today's own section header sits right below
    // the sticky app header.
    await expect(page.locator("#feed-section-today")).toBeVisible();
  });

  test("tapping Filters opens the sheet; Escape and backdrop-tap both close it", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    await page.locator(".filters-button").click();
    const sheet = page.locator('.filter-sheet[role="dialog"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(page.locator(".filter-sheet-overlay")).toHaveCount(0);

    await page.locator(".filters-button").click();
    await expect(page.locator(".filter-sheet-overlay")).toBeVisible();
    // Clicking the dimmed backdrop itself (not the sheet panel) dismisses it.
    await page.locator(".filter-sheet-overlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".filter-sheet-overlay")).toHaveCount(0);
  });

  test("picking a tag inside the sheet filters the feed and closes the sheet", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    await page.locator(".filters-button").click();
    await expect(page.locator(".filter-sheet-overlay")).toBeVisible();

    // Anchored regex, not a plain substring match: the source pill
    // "e2e-pagination.example.com (N)" also contains "e2e-pagination" and
    // would otherwise match too — this picks the tag pill specifically.
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes(`tag=${PAGINATION_TAG}`)),
      page.locator(".filter-sheet .pill", { hasText: new RegExp(`^${PAGINATION_TAG} \\(`) })
        .click(),
    ]);
    expect(request.url()).toContain(`tag=${PAGINATION_TAG}`);

    // "Applies it AND closes the sheet" — the sheet is gone, and the
    // dismissible active-filter chip above the feed now shows the pick.
    await expect(page.locator(".filter-sheet-overlay")).toHaveCount(0);
    await expect(page.locator(".filter-chip")).toContainText(PAGINATION_TAG);
  });
});

test.describe("desktop sidebar is unaffected", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the right-hand sidebar renders and the mobile Filters button stays hidden", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".filters-button")).toBeHidden();
    await expect(page.locator(".filter-sheet-overlay")).toHaveCount(0);
  });
});
