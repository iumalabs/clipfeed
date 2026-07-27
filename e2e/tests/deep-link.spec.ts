import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { loadAllArticles } from "../fixtures/loadAllArticles.ts";

const DEEPLINK_ARTICLE_ID = "e2e-deeplink-target";

test("/a/:id opens the card expanded and scrolled into view", async ({ page }) => {
  await installFixedClock(page);
  await page.goto(`/a/${DEEPLINK_ARTICLE_ID}`);

  const card = page.locator(`[data-article-id="${DEEPLINK_ARTICLE_ID}"]`);
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card).toBeInViewport();
  await expect(page.locator(".back-to-feed-link")).toBeVisible();
});

test("logo click resets an active tag filter back to the default feed view", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");
  await loadAllArticles(page);

  await page.locator(".tag-pill", { hasText: "e2e-deeplink" }).first().click();
  await expect(page.locator(".filter-chip")).toContainText("e2e-deeplink");

  await page.locator(".logo-button").click();
  await expect(page.locator(".filter-chip")).toHaveCount(0);
});
