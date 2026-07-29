import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Task 61: the owner's bug report — an article added TODAY but with an
// older published_at used to render under "Earlier" (sections used to
// bucket by published_at). Sections now bucket by added_at only (see
// lib/feed/dateGrouping.ts), while the card's own date label still shows
// the article's real published_at (falling back to added_at only when
// missing/unparseable — see lib/format/format.ts's resolveCardDateIso).
// Fixture: seed-sql.ts's sectionGroupingRows — added 2 min before the
// fixed clock (2026-01-15T12:00:00Z), published 4 days before that
// (2026-01-11T12:00:00Z).
const ARTICLE_ID = "e2e-sectiongrouping-old-published";

test("an article added today but published days ago renders under Today, with its card showing the published date", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  const card = page.locator(`#feed-section-today [data-article-id="${ARTICLE_ID}"]`);
  await expect(card).toBeVisible();

  // Not under "Earlier" — the exact regression this fixes.
  await expect(page.locator(`#feed-section-earlier [data-article-id="${ARTICLE_ID}"]`)).toHaveCount(
    0,
  );

  // The card shows the OLD published date (11 янв.), not today's added
  // date (15 янв.) — ru-RU, {day: "numeric", month: "short"}, same as
  // lib/format/format.ts's formatDate.
  await expect(card.locator(".card-date")).toHaveText("11 янв.");
});
