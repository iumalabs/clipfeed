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

// Task 60: clicking the logo from "/a/<id>" previously cleared filters but
// left the single-article view mounted and the URL unchanged — see
// App.tsx's handleLogoClick / resetDeepLink.
test("logo click from a deep-linked article returns to the normal feed and clears the URL", async ({ page }) => {
  await installFixedClock(page);
  await page.goto(`/a/${DEEPLINK_ARTICLE_ID}`);
  await expect(page.locator(".back-to-feed-link")).toBeVisible();

  await page.locator(".logo-button").click();

  await expect(page.locator(".back-to-feed-link")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

// Task 60: "/a/" (no id) previously fell through to the Cloudflare Workers
// Assets binding's own plain 404 response — wrangler.toml's [assets]
// not_found_handling now serves the SPA shell instead, which renders its own
// styled not-found view (see components/NotFound.tsx).
test("/a/ with no id shows the app's own not-found view, not a raw 404", async ({ page }) => {
  await installFixedClock(page);
  const response = await page.goto("/a/");

  expect(response?.status()).toBe(200);
  await expect(page.locator(".empty-state-title")).toBeVisible();

  await page.locator(".empty-state-reset").click();
  await expect(page.locator(".feed-section").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
