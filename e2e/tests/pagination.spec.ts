import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { runSql } from "../fixtures/db.ts";

// Task 49 regression: the feed used to collapse to a single page (~11 items
// shown while the DB held 97) because the initial-load loop and the
// feed-level poll had separate failure modes — see packages/web/src/lib/
// pagination.ts's fetchInitialPages and feedPoll.ts's applyFeedPollSnapshot.
// This test seeds the incident's own numbers (19 today / 30 yesterday / page
// size 20) and asserts both halves directly against a real running worker.
test("today+yesterday fully load, Show more extends Earlier, and a poll tick never shrinks the list", async ({ page }) => {
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

  await expect(page.locator("#feed-section-today .feed-section-count")).toHaveText("20");
  await expect(page.locator("#feed-section-yesterday .feed-section-count")).toHaveText("30");

  // The initial-load loop's own boundary page already pulled in the first
  // 10 of pagination's 20 "earlier" fixture rows (see fetchInitialPages).
  await page.locator("#feed-section-earlier .feed-section-header").click();
  await expect(page.locator("#feed-section-earlier .feed-section-count")).toHaveText("10");

  await page.locator(".show-more-button").click();
  await expect(page.locator("#feed-section-earlier .feed-section-count")).toHaveText("30");

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
