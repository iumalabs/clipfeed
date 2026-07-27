import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { loadAllArticles } from "../fixtures/loadAllArticles.ts";

// Task 40 regression: switching to EN mode used to fire a translate request
// for EVERY card missing an English edition the instant EN mode turned on,
// regardless of whether the card was ever actually seen — see
// packages/web/src/components/ArticleCard.tsx's useEnglishTranslation
// (viewport-gated via IntersectionObserver) and lib/englishGate.ts
// (hasEnglish). The real translate endpoint is intercepted here so this
// test verifies purely the SPA's own request-firing logic, never a real
// queue job (which would need a live Workers AI call).
test("EN mode only requests translation for on-screen, untranslated cards", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");
  await loadAllArticles(page);

  // Narrow the feed down to exactly this group's 13 fixture rows (3 already
  // translated, 10 not) — clicking any rendered card's own tag pill re-runs
  // the initial-load effect with `tag=e2e-translate`, filtering server-side.
  await page.locator(".tag-pill", { hasText: "e2e-translate" }).first().click();
  await expect(page.locator(".filter-chip")).toContainText("e2e-translate");

  const requestedIds: string[] = [];
  await page.route("**/api/admin/articles/*/translate", async (route) => {
    const match = route.request().url().match(/articles\/([^/]+)\/translate/);
    if (match) requestedIds.push(match[1]);
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ id: match?.[1], status: "pending" }),
    });
  });

  await page.locator(".lang-toggle button").nth(1).click(); // "EN"

  // Give the IntersectionObserver's initial (already-in-viewport) callback
  // batch time to fire — this is intentionally short; it's checking that
  // NOT everything fired yet, not waiting for anything to settle.
  await page.waitForTimeout(1000);

  const hasEnglishIds = ["e2e-translate-hasen-0", "e2e-translate-hasen-1", "e2e-translate-hasen-2"];
  for (const id of hasEnglishIds) {
    expect(requestedIds, `${id} already has English — must never be requested`).not.toContain(id);
  }

  const needsEnglishRequestedSoFar = requestedIds.filter((id) => id.startsWith("e2e-translate-needsen-"));
  expect(
    needsEnglishRequestedSoFar.length,
    "the whole feed must not fire at once — some off-screen cards should still be un-requested",
  ).toBeLessThan(10);

  // Scroll the last (guaranteed off-screen) needsEnglish card into view —
  // its own translate request should fire only now.
  const lastCard = page.locator('[data-article-id="e2e-translate-needsen-9"]');
  await lastCard.scrollIntoViewIfNeeded();
  await expect.poll(() => requestedIds.includes("e2e-translate-needsen-9"), { timeout: 5000 })
    .toBe(true);

  for (const id of hasEnglishIds) {
    expect(requestedIds, `${id} must still never be requested after scrolling`).not.toContain(id);
  }
});
