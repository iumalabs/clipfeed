// Task 50: expands "Earlier" and clicks "Show more" until every seeded
// fixture (across all groups — see scripts/e2e/seed-sql.ts) is loaded into
// the DOM. Every non-pagination fixture group is deliberately seeded well
// into "earlier" (see seed-sql.ts's doc comment) so this is the shared setup
// step for the translate-gating, owner-visitor, and deep-link specs — the
// pagination spec exercises this loop itself, so it doesn't use this helper.
import type { Page } from "@playwright/test";

const MAX_SHOW_MORE_CLICKS = 6;

export async function loadAllArticles(page: Page): Promise<void> {
  const earlierHeader = page.locator("#feed-section-earlier .feed-section-header");
  if (await earlierHeader.getAttribute("aria-expanded") === "false") {
    await earlierHeader.click();
  }

  const showMoreButton = page.locator(".show-more-button");
  for (let i = 0; i < MAX_SHOW_MORE_CLICKS; i++) {
    if (!(await showMoreButton.isVisible().catch(() => false))) return;
    const responsePromise = page.waitForResponse((res) =>
      /\/api\/(admin\/)?articles(\?|$)/.test(res.url())
    );
    await showMoreButton.click();
    await responsePromise;
  }
}
