import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";
import { loadAllArticles } from "../fixtures/loadAllArticles.ts";

// Owner-only mutating card actions had zero E2E coverage before this spec —
// every other spec in this suite either only reads, or (duplicate-add) hits
// a 409 that never reaches the pipeline. This deliberately covers ONLY
// archive/unarchive and delete: pure D1 mutations (PATCH/DELETE
// /api/admin/articles/:id) with no queue/pipeline involvement. Retry,
// resummarize, and adding a genuinely NEW url are excluded on purpose — all
// three enqueue a real fetch->extract->summarize pipeline run against
// whatever URL is on the row, which for a fake "e2e-*.example.com" domain
// means a real, slow, doomed-to-fail network call — exactly what this
// harness exists to avoid (see scripts/e2e/run.ts's doc comment).
const OWNERACTIONS_TAG = "e2e-owneractions";
const ARCHIVE_ID = "e2e-owneractions-archive";
const DELETE_ID = "e2e-owneractions-delete";

test.describe("owner archive/unarchive", () => {
  test("archiving a card removes it from the default feed, and it reappears in the archived view", async ({ page }) => {
    await installFixedClock(page);
    await signInAsOwner(page);
    await page.goto("/");
    await loadAllArticles(page);

    await page.locator(".tag-pill", { hasText: OWNERACTIONS_TAG }).first().click();
    await expect(page.locator(".filter-chip")).toContainText(OWNERACTIONS_TAG);

    const card = page.locator(`[data-article-id="${ARCHIVE_ID}"]`);
    await expect(card).toBeVisible();
    await card.locator(".card-title-button").click();
    await expect(card).toHaveAttribute("aria-expanded", "true");

    await card.getByRole("button", { name: "В архив" }).click();
    await expect(card).not.toBeAttached();

    // Switch to the archived view (owner-only sidebar toggle) — the same
    // tag filter carries over, so this stays scoped to this fixture group.
    await page.locator(".archive-link").click();
    const archivedCard = page.locator(`[data-article-id="${ARCHIVE_ID}"]`);
    await expect(archivedCard).toBeVisible();

    // Unarchive it again so this test leaves the fixture in a re-runnable
    // state (not strictly required — a fresh `deno task e2e` reseeds from
    // scratch — but avoids a false "still archived" reading if this test is
    // ever re-run against a persisted worker without reseeding).
    await archivedCard.locator(".card-title-button").click();
    await archivedCard.getByRole("button", { name: "Из архива" }).click();
    await expect(archivedCard).not.toBeAttached();

    await page.locator(".archive-link").click();
    await expect(page.locator(`[data-article-id="${ARCHIVE_ID}"]`)).toBeVisible();
  });
});

test.describe("owner delete", () => {
  test("deleting a card removes it permanently, even after a reload", async ({ page }) => {
    await installFixedClock(page);
    await signInAsOwner(page);
    await page.goto("/");
    await loadAllArticles(page);

    await page.locator(".tag-pill", { hasText: OWNERACTIONS_TAG }).first().click();
    await expect(page.locator(".filter-chip")).toContainText(OWNERACTIONS_TAG);

    const card = page.locator(`[data-article-id="${DELETE_ID}"]`);
    await expect(card).toBeVisible();
    await card.locator(".card-title-button").click();

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Удалить" }).click();
    await expect(card).not.toBeAttached();

    await page.reload();
    await loadAllArticles(page);
    await page.locator(".tag-pill", { hasText: OWNERACTIONS_TAG }).first().click();
    await expect(page.locator(`[data-article-id="${DELETE_ID}"]`)).not.toBeAttached();
  });
});
