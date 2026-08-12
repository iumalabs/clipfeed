import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { runSql } from "../fixtures/db.ts";

// The aggregate agent-batch progress indicator (AgentBatchIndicator.tsx,
// driven by lib/feed/agentBatch.ts) had zero E2E coverage before this spec —
// it's owner-only UI, distinct from the individual-card skeleton/pending
// states owner-visitor.spec.ts already covers (an agent-added pending row
// renders as null on its own, see ArticleCard.tsx's Part A branch; this
// indicator is what represents it instead). Three fixture rows
// (seed-sql.ts's agentBatchRows, all 'agent'-added and 'pending', within the
// same wave) are flipped to 'ready' one at a time via direct SQL — same
// technique as pagination.spec.ts's poll-merge card — to walk the indicator
// through all three of its phrasings without a real pipeline run.
const AGENTBATCH_TAG = "e2e-agentbatch";
const AGENTBATCH_IDS = ["e2e-agentbatch-0", "e2e-agentbatch-1", "e2e-agentbatch-2"];

function markReady(id: string, title: string): void {
  runSql(
    "UPDATE articles SET status='ready', " +
      `summary_json='{"title_ru":"${title}","tldr_ru":"Готово.",` +
      `"body_ru":["Текст."],"bullets_ru":["Пункт."],"tags":[],"lang_original":"ru"}', ` +
      `summary_ru='Готово.' WHERE id='${id}';`,
  );
}

test("agent batch indicator walks Preparing -> M of N ready -> gone as rows complete", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");

  // Every row in this fixture group is a hidden agent-pending card (see
  // pendingCardVariant) — there's no rendered in-card ".tag-pill" button to
  // click yet, unlike every other tag-filtered spec in this suite. The
  // sidebar's own facet pill (".pill", not ".tag-pill" — see
  // facets.spec.ts) is fetched eagerly regardless of what's loaded, so it's
  // the only way to filter down to this group before any card exists.
  await page.locator(".sidebar .pill", { hasText: new RegExp(`^${AGENTBATCH_TAG} \\(`) }).click();
  await expect(page.locator(".filter-chip")).toContainText(AGENTBATCH_TAG);

  const earlierHeader = page.locator("#feed-section-earlier .feed-section-header");
  if (await earlierHeader.getAttribute("aria-expanded") === "false") {
    await earlierHeader.click();
  }

  const indicator = page.locator(".agent-batch-indicator");
  // Preparing phase: none of the three pending rows render as individual
  // cards (agent-pending is the one added_via that's hidden, not skeletoned
  // — see pendingCardVariant) — only the aggregate indicator is visible.
  await expect(indicator).toHaveText("Готовятся 3 выжимки…");
  for (const id of AGENTBATCH_IDS) {
    await expect(page.locator(`[data-article-id="${id}"]`)).not.toBeAttached();
  }

  // Partial phase: one row completes, the indicator updates, and that one
  // row now renders as a real card alongside it.
  markReady(AGENTBATCH_IDS[0], "Agent batch #0 (ready)");
  await expect(indicator).toHaveText("Готово 1 из 3 выжимки", { timeout: 10_000 });
  await expect(page.locator(`[data-article-id="${AGENTBATCH_IDS[0]}"]`)).toContainText(
    "Agent batch #0 (ready)",
  );
  await expect(page.locator(`[data-article-id="${AGENTBATCH_IDS[1]}"]`)).not.toBeAttached();
  await expect(page.locator(`[data-article-id="${AGENTBATCH_IDS[2]}"]`)).not.toBeAttached();

  // Done phase: the remaining two complete, the indicator disappears
  // entirely, and every row now renders as a normal card.
  markReady(AGENTBATCH_IDS[1], "Agent batch #1 (ready)");
  markReady(AGENTBATCH_IDS[2], "Agent batch #2 (ready)");
  await expect(indicator).toHaveCount(0, { timeout: 10_000 });
  for (const id of AGENTBATCH_IDS) {
    await expect(page.locator(`[data-article-id="${id}"]`)).toBeVisible();
  }
});
