// Task 50: expands "Earlier" and clicks "Show more" until every seeded
// fixture (across all groups — see scripts/e2e/seed-sql.ts) is loaded into
// the DOM. Every non-pagination fixture group is deliberately seeded well
// into "earlier" (see seed-sql.ts's doc comment) so this is the shared setup
// step for the translate-gating, owner-visitor, and deep-link specs — the
// pagination spec exercises this loop itself, so it doesn't use this helper.
import { expect, type Page } from "@playwright/test";

const MAX_SHOW_MORE_CLICKS = 6;

export async function loadAllArticles(page: Page): Promise<void> {
  const earlierHeader = page.locator("#feed-section-earlier .feed-section-header");
  if (await earlierHeader.getAttribute("aria-expanded") === "false") {
    await earlierHeader.click();
  }

  const showMoreButton = page.locator(".show-more-button");
  for (let i = 0; i < MAX_SHOW_MORE_CLICKS; i++) {
    if ((await showMoreButton.count()) === 0) return;
    // Wait for it to actually be clickable before touching it — a bare
    // isVisible() check can still catch the button mid-fetch (disabled from
    // the PREVIOUS iteration's still-settling re-render), which then races
    // Playwright's own click-actionability wait against that same re-render
    // finishing (or, on the last page, against the button being removed
    // entirely once hasMore flips false) and times out the whole test
    // instead of just moving on.
    try {
      await expect(showMoreButton).toBeEnabled({ timeout: 10_000 });
    } catch {
      return; // never became clickable — already fully loaded, or gone
    }

    const responsePromise = page.waitForResponse((res) =>
      /\/api\/(admin\/)?articles(\?|$)/.test(res.url())
    );
    try {
      await showMoreButton.click({ timeout: 10_000 });
    } catch {
      // Can legitimately detach out from under the click itself if this was
      // the last page — same "nothing left to load" outcome, not a failure.
      return;
    }
    await responsePromise;
  }
}
