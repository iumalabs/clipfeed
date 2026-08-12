import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";

// Theme toggling (lib/ui/theme.ts's useTheme) had zero E2E coverage before
// this spec — englishGate/theme_test.ts covers the pure resolve/read/write
// logic in isolation, but never the actual header button wired to a real
// DOM attribute, nor that the choice survives a reload the way a real user's
// would.
test("the theme toggle flips data-theme and persists it across a reload", async ({ page }) => {
  await installFixedClock(page);
  await page.goto("/");

  const html = page.locator("html");
  const themeButton = page.locator(".app-header .icon-button").first();

  const initialTheme = await html.getAttribute("data-theme");
  expect(initialTheme === "light" || initialTheme === "dark").toBe(true);
  const flipped = initialTheme === "dark" ? "light" : "dark";

  await themeButton.click();
  await expect(html).toHaveAttribute("data-theme", flipped);
  expect(await page.evaluate(() => localStorage.getItem("clipfeed-theme"))).toBe(flipped);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", flipped);

  // Leave it back the way it started so a re-run against a persisted
  // worker/browser profile (rare, but the suite doesn't guarantee a fresh
  // profile per test) sees the same initial state this test itself assumed.
  await themeButton.click();
  await expect(html).toHaveAttribute("data-theme", initialTheme!);
});
