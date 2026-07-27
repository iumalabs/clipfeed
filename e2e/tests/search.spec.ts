import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Real Vectorize/Workers AI cannot run in local `wrangler dev` without a
// live Cloudflare account (`Vectorize Index bindings do not support local
// development` — confirmed empirically while building this harness), so the
// semantic half of these tests mocks GET /api/search's response instead of
// exercising the real embedding pipeline. That's a deliberate, documented
// boundary (see the PR description's Part D report) — it verifies the SPA's
// own mode-switch and fallback-trigger logic honestly, without pretending to
// cover real semantic ranking quality, which has no deterministic offline
// story at all.
function mockPublicArticle(id: string, titleRu: string, tldrRu: string) {
  return {
    id,
    url: `https://e2e-search-mock.example.com/${id}`,
    canonical_url: null,
    title: titleRu,
    source: "e2e-search-mock.example.com",
    author: null,
    published_at: null,
    added_at: "2026-01-14T08:00:00.000Z",
    added_via: "manual",
    lang_original: "ru",
    summary_ru: tldrRu,
    summary_en: null,
    summary_json: {
      title_ru: titleRu,
      tldr_ru: tldrRu,
      body_ru: [tldrRu],
      bullets_ru: ["Пункт."],
      tags: [],
      lang_original: "ru",
    },
    tags: [],
    status: "ready",
    archived: false,
    has_error: false,
    fail_class: null,
    heal_attempts: 0,
    faithfulness_verdict: null,
    faithfulness_checked_at: null,
    embedded_at: null,
    telegram_published_at: null,
    en_generated_at: null,
    image_key: null,
    image_source_url: null,
    image_width: null,
    image_height: null,
    processing_started_at: null,
  };
}

test("keyword search matches a Russian inflected form via stemming", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  await page.locator(".search-input").fill("кабель");
  await expect(page.locator(".card-title", { hasText: "Новые сетевые кабели для дата-центров" }))
    .toBeVisible({ timeout: 5000 });
  await expect(page.locator(".card-title", { hasText: "Совершенно не связанная статья" }))
    .toHaveCount(0);
});

test("switching to semantic mode fires a request to the semantic endpoint and renders its results", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  let semanticRequested = false;
  await page.route("**/api/search*", async (route) => {
    semanticRequested = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ article: mockPublicArticle("mock-1", "Похожая статья по смыслу", "TLDR"), score: 0.9 }],
      }),
    });
  });

  await page.locator(".search-input").fill("квантовый");
  await page.locator(".search-mode-toggle button").nth(1).click(); // "по смыслу"

  await expect(page.locator(".semantic-matches-count")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".card-title", { hasText: "Похожая статья по смыслу" })).toBeVisible();
  expect(semanticRequested).toBe(true);
});

test("a zero-keyword-result search automatically falls back to semantic mode", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  await page.route("**/api/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{
          article: mockPublicArticle("mock-fallback-1", "Найдено по смыслу (fallback)", "TLDR"),
          score: 0.8,
        }],
      }),
    });
  });

  await page.locator(".search-input").fill("zzznonexistentquery123");

  await expect(page.locator(".semantic-fallback-heading")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".card-title", { hasText: "Найдено по смыслу (fallback)" })).toBeVisible();
});
