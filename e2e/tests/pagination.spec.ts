import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { runSql } from "../fixtures/db.ts";

// Task 49 regression: the feed used to collapse to a single page (~11 items
// shown while the DB held 97) because the initial-load loop and the
// feed-level poll had separate failure modes — see
// packages/web/src/lib/feed/pagination.ts's fetchInitialPages and
// feedPoll.ts's applyFeedPollSnapshot.
// This test seeds the incident's own numbers (19 today / 30 yesterday / page
// size 20) and asserts both halves directly against a real running worker.
//
// Task 51: "Earlier" used to show however many rows had been lazy-loaded so
// far (climbing as the user clicked "show more") instead of the true total —
// see GET /api/articles/counts and Feed.tsx's resolveSectionCount. The
// server count for an UNFILTERED view mixes in every other e2e fixture
// group's own "earlier"-dated rows too (every non-pagination group is seeded
// well into "earlier" — see seed-sql.ts's doc comment), so this isolates to
// just this fixture group's own known 20 "earlier" rows via its tag, the same
// way every other multi-group spec in this suite does (see
// loadAllArticles.ts's doc comment).
const PAGINATION_TAG = "e2e-pagination";

test("today+yesterday fully load, Earlier's count is the true total from the start, and a poll tick never shrinks the list", async ({ page }) => {
  // Playwright's own headless tab visibility is platform-dependent — force
  // it non-hidden via an init script (runs before the SPA's own scripts) so
  // the feed poll (gated on `!document.hidden`, see App.tsx) isn't skipped
  // for reasons unrelated to what this test verifies.
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  await installFixedClock(page);
  // Owner mode: the manually-added pending "poll card" only renders at all
  // for the owner (a visitor's public API never returns pending rows — see
  // Task 41 Part D) — needed to exercise the poll-merge half of this test.
  await signInAsOwner(page);
  await page.goto("/");

  // Task 61: 19 pagination "today" rows + 1 pending poll card + 1 unrelated
  // "today" row from seed-sql.ts's section-grouping fixture group (added
  // today, published days ago — proves sections bucket by added_at, not
  // published_at) + 2 more "today" rows from the facets fixture group
  // (seed-sql.ts's facetsRows — deliberately half-today/half-earlier so the
  // facets spec can prove its counts aren't just the loaded window) = 23.
  await expect(page.locator("#feed-section-today .feed-section-count")).toHaveText("23");
  await expect(page.locator("#feed-section-yesterday .feed-section-count")).toHaveText("30");

  await page.locator(".tag-pill", { hasText: PAGINATION_TAG }).first().click();
  await expect(page.locator(".filter-chip")).toContainText(PAGINATION_TAG);

  await page.locator("#feed-section-earlier .feed-section-header").click();
  // Task 51 regression: the count is the true total from the very first
  // render (20, this fixture group's own "earlier" row count) — the
  // initial-load loop's own boundary page has only pulled in the first 10
  // of them by this point (see fetchInitialPages), which is exactly the
  // stale value the old, loaded-length-only header used to show.
  await expect(page.locator("#feed-section-earlier .feed-section-count")).toHaveText("20");

  await page.locator(".show-more-button").click();
  // Loading the remaining 10 rows must NOT change the header — still 20.
  // (The header text is now server-driven and no longer tracks loaded-item
  // count — see resolveSectionCount — so it can't double as a "the new page
  // finished loading" signal the way it used to; wait on the actual card
  // count instead before measuring totalBefore below.)
  await expect(page.locator("#feed-section-earlier .feed-section-count")).toHaveText("20");
  await expect(page.locator("#feed-section-earlier article")).toHaveCount(20);

  const totalBefore = await page.locator("article").count();

  // Simulate the pipeline finishing this one pending article — the feed
  // poll's next tick (fast phase: every 4s, see pollSchedule.ts) should
  // refresh this specific card in place, never truncate the rest.
  runSql(
    "UPDATE articles SET status='ready', " +
      `summary_json='{"title_ru":"Pagination poll card (now ready)","tldr_ru":"Готово.",` +
      `"body_ru":["Текст."],"bullets_ru":["Пункт."],"tags":[],"lang_original":"ru"}', ` +
      "summary_ru='Готово.' WHERE id='e2e-page-pollcard';",
  );

  await expect(page.locator('[data-article-id="e2e-page-pollcard"]')).toContainText(
    "Pagination poll card (now ready)",
    { timeout: 10_000 },
  );

  const totalAfter = await page.locator("article").count();
  expect(totalAfter).toBe(totalBefore);
});
