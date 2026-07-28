import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Task 56: "Subscribe on Telegram" banner. The e2e harness's wrangler.toml
// passes TELEGRAM_CHANNEL_URL through unchanged from the real config (see
// scripts/e2e/run.ts — it only regex-patches two timeout vars), so these
// tests exercise the "configured" half live; the "unset/invalid" half is
// covered by the pure isValidTelegramChannelUrl unit tests
// (packages/web/src/lib/api/telegramConfig_test.ts) since there's no
// component-level DOM test harness in this repo (see mobile-filters.spec.ts
// for the same split).

test.describe("desktop sidebar", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows the Subscribe on Telegram banner as the last sidebar item", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    const banner = page.locator(".sidebar .telegram-banner");
    await expect(banner).toBeVisible();
    const link = banner.locator("a.telegram-banner-button");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("href", /^https:\/\/t\.me\//);
  });
});

test.describe("mobile filter sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the banner at the bottom of the sheet, after tags/sources/total/archive", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    await page.locator(".filters-button").click();
    const sheet = page.locator('.filter-sheet[role="dialog"]');
    await expect(sheet).toBeVisible();

    const banner = sheet.locator(".telegram-banner");
    await expect(banner).toBeVisible();

    // "Bottom of the sheet" — it's the last element among the sheet's
    // direct children.
    const lastChild = sheet.locator(":scope > *").last();
    await expect(lastChild).toHaveClass(/telegram-banner/);
  });
});
