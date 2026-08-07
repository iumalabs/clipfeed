import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { loadAllArticles } from "../fixtures/loadAllArticles.ts";

// "Show what was actually flagged, not just a count" — a 'weak'/'fail'
// faithfulness verdict used to show the owner a bare unsupported/
// contradicted COUNT, which named nothing they could act on. The badge (and
// its owner-only expanded-card footnote) now resolves each flagged judge
// claim back to the actual summary sentence it refers to (see
// lib/content/faithfulness.ts's resolveFlaggedClaims). Zero E2E coverage
// existed for either the badge or the footnote before this spec.
const FAITHFULNESS_TAG = "e2e-faithfulness";
const ARTICLE_ID = "e2e-faithfulness-weak";
const FLAGGED_BULLET = "Пункт первый.";

test("owner sees the weak-verdict badge with a tooltip, and the footnote names the actual flagged claim", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");
  await loadAllArticles(page);

  await page.locator(".tag-pill", { hasText: FAITHFULNESS_TAG }).first().click();
  await expect(page.locator(".filter-chip")).toContainText(FAITHFULNESS_TAG);

  const card = page.locator(`[data-article-id="${ARTICLE_ID}"]`);
  await expect(card).toBeVisible();

  const badge = card.locator(".faithfulness-badge--weak");
  await expect(badge).toHaveText("требует проверки");

  await card.locator(".card-title-button").click();
  await expect(card).toHaveAttribute("aria-expanded", "true");

  const footnote = card.locator(".faithfulness-footnote");
  await expect(footnote).toBeVisible();
  // Names the actual flagged bullet text (claim index 2, "unsupported" in
  // the fixture) — not a bare count.
  await expect(footnote).toContainText(FLAGGED_BULLET);
  await expect(footnote.locator(".faithfulness-claim")).toContainText("не подтверждено:");
});

test("visitor never sees the faithfulness badge, even for the same weak-verdict article", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");
  await loadAllArticles(page);

  await page.locator(".tag-pill", { hasText: FAITHFULNESS_TAG }).first().click();
  await expect(page.locator(".filter-chip")).toContainText(FAITHFULNESS_TAG);

  const card = page.locator(`[data-article-id="${ARTICLE_ID}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator(".faithfulness-badge")).toHaveCount(0);
});
