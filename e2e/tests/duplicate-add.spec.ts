import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";

// Task 55: adding a URL that already exists used to just show a dead-end
// error toast — the owner had no way to locate the existing article,
// especially if it was archived (auto-archive from healing/faithfulness)
// or failed (hidden from the default ready-only feed). handleAdd now
// closes the dialog and reveals the existing article via the same
// "/a/<id>" deep-link resolution a real deep link uses (see App.tsx's
// revealDeepLink), with a toast naming its state. These three rows (own
// tag/source, see seed-sql.ts's duplicateAddRows) are pinned well into
// "earlier" — deliberately NOT in the initial-load window, so each of
// these three tests exercises the "fetch standalone, render
// DeepLinkedArticle" reveal path, not the simpler in-place-expand one.
const DUPADD_READY_URL = "https://e2e-dupadd.example.com/ready";
const DUPADD_ARCHIVED_URL = "https://e2e-dupadd.example.com/archived";
const DUPADD_FAILED_URL = "https://e2e-dupadd.example.com/failed";

async function submitDuplicateAdd(page: Page, url: string): Promise<void> {
  await page.locator(".add-button").click();
  await page.locator("#add-modal-url").fill(url);
  await page.locator(".modal-submit").click();
}

test("a ready, non-archived duplicate is revealed expanded with an 'already in your feed' toast", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");

  await submitDuplicateAdd(page, DUPADD_READY_URL);

  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText("Эта статья уже в ленте");
  const card = page.locator('[data-article-id="e2e-dupadd-ready"]');
  await expect(card).toHaveAttribute("aria-expanded", "true");
  await expect(card).toBeInViewport();
});

test("an archived duplicate is revealed with an 'archived' toast and its unarchive control", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");

  await submitDuplicateAdd(page, DUPADD_ARCHIVED_URL);

  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText("Статья в архиве");
  const card = page.locator('[data-article-id="e2e-dupadd-archived"]');
  await expect(card).toBeInViewport();
  // The owner's unarchive control ("Из архива") is the way back — proves
  // the reveal doesn't just show the card, it shows the FULL owner-mode
  // controls for it.
  await expect(card.locator('[aria-label="Из архива"]')).toBeVisible();
});

test("a failed duplicate is revealed with a 'failed — can retry' toast and its retry/delete controls", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");

  await submitDuplicateAdd(page, DUPADD_FAILED_URL);

  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText(
    "Эта статья не обработалась — можно повторить",
  );
  const card = page.locator('[data-article-id="e2e-dupadd-failed"]');
  await expect(card).toBeInViewport();
  await expect(card.locator(".retry-button")).toBeVisible();
  await expect(card.locator(".delete-button-outline, .delete-button-prominent")).toBeVisible();
});
