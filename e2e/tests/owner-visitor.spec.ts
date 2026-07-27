import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { loadAllArticles } from "../fixtures/loadAllArticles.ts";

// Task 41 Part D regression coverage: a visitor's public API forces
// status='ready' server-side (see packages/api/src/index.ts's GET
// /api/articles), so pending/failed rows must never even reach the SPA, let
// alone render — this is a server-side guarantee, and this test verifies it
// end-to-end rather than trusting the SPA's own (belt-and-braces) `!isOwner
// -> return null` branches in ArticleCard.tsx.
test("visitor sees only the ready article — pending/failed rows never appear", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");
  await loadAllArticles(page);

  await page.locator(".tag-pill", { hasText: "e2e-ownervis" }).first().click();
  await expect(page.locator(".filter-chip")).toContainText("e2e-ownervis");

  await expect(page.locator('[data-article-id="e2e-ownervis-ready"]')).toBeVisible();
  await expect(page.locator('[data-article-id="e2e-ownervis-pending"]')).toHaveCount(0);
  await expect(page.locator('[data-article-id="e2e-ownervis-failed"]')).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(1);
});

test("owner sees the ready, pending, and failed rows for the same fixture group", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");
  await loadAllArticles(page);

  await page.locator(".tag-pill", { hasText: "e2e-ownervis" }).first().click();
  await expect(page.locator(".filter-chip")).toContainText("e2e-ownervis");

  await expect(page.locator('[data-article-id="e2e-ownervis-ready"]')).toBeVisible();
  await expect(page.locator('[data-article-id="e2e-ownervis-pending"]')).toHaveClass(/card--skeleton/);
  await expect(page.locator('[data-article-id="e2e-ownervis-failed"]')).toHaveClass(/card--failed/);
  await expect(page.locator("article")).toHaveCount(3);
});
