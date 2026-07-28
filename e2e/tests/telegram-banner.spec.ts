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

// Task 56.5: header icon + footer link, both sourced from the same
// telegram_channel_url as the banner above — these three must always
// appear or hide together (see Header.tsx/Footer.tsx/App.tsx wiring).
test.describe("header icon and footer link", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("header icon group ends theme -> GitHub -> Telegram -> add/sign-in, and footer link is present", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    // repoUrl/telegramChannelUrl are fetched from /api/config after mount —
    // wait for the Telegram icon (the last of the three) before reading the
    // group, otherwise this races the fetch and only sees the theme toggle.
    const telegramLink = page.locator('.app-header a[aria-label*="Telegram" i]');
    await expect(telegramLink).toBeVisible();

    const icons = page.locator(".app-header .icon-button");
    const labels = await icons.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    // Theme toggle is always first; GitHub and Telegram (both config-gated,
    // both configured in this repo's own wrangler.toml) must follow it in
    // that order, immediately before the trailing icon-buttons (if any).
    const themeIdx = labels.findIndex((l) => l && /тему|theme/i.test(l));
    const githubIdx = labels.findIndex((l) => l && /GitHub/i.test(l));
    const telegramIdx = labels.findIndex((l) => l && /Telegram/i.test(l));
    expect(themeIdx).toBeGreaterThanOrEqual(0);
    expect(githubIdx).toBeGreaterThan(themeIdx);
    expect(telegramIdx).toBeGreaterThan(githubIdx);

    await expect(telegramLink).toHaveAttribute("target", "_blank");
    await expect(telegramLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(telegramLink).toHaveAttribute("href", /^https:\/\/t\.me\//);

    const footerLink = page.locator(".app-footer-line a", { hasText: "Telegram" });
    await expect(footerLink).toHaveAttribute("href", /^https:\/\/t\.me\//);
  });
});

// Task 56.5 §4: mobile overflow check at the smallest common breakpoint —
// the extra header icon must not push the page into horizontal scroll.
test.describe("mobile header overflow", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("no horizontal scroll with the extra Telegram icon in the header", async ({ page }) => {
    await installFixedClock(page);
    await page.goto("/");

    const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowing).toBe(false);
  });
});
