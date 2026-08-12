import { expect, test } from "@playwright/test";
import { installFixedClock } from "../fixtures/clock.ts";
import { signInAsOwner } from "../fixtures/owner.ts";

// AddModal's own UI mechanics (open/close affordances, empty-URL validation,
// the happy-path submit) had zero E2E coverage before this spec —
// duplicate-add.spec.ts drives the same modal but only ever exercises the
// 409-duplicate branch of handleAdd (see App.tsx), never a clean create. A
// genuinely new URL would enqueue a real fetch->extract->summarize pipeline
// run (see owner-actions.spec.ts's doc comment for why that's avoided here),
// so the happy-path test intercepts POST /api/admin/articles the same way
// translate-gating.spec.ts/search.spec.ts intercept their own endpoints,
// verifying the SPA's own request/response handling rather than a real
// pipeline outcome.
const NEW_URL = "https://e2e-addmodal.example.com/fresh";

test.describe("add modal open/close mechanics", () => {
  test("Escape, backdrop click, and the Cancel button all close the modal without submitting", async ({ page }) => {
    await installFixedClock(page);
    await signInAsOwner(page);
    await page.goto("/");

    let createRequested = false;
    await page.route("**/api/admin/articles", (route) => {
      if (route.request().method() === "POST") createRequested = true;
      route.continue();
    });

    await page.locator(".add-button").click();
    const overlay = page.locator(".modal-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("#add-modal-url")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);

    await page.locator(".add-button").click();
    await expect(overlay).toBeVisible();
    // Clicking the dimmed backdrop itself (not the modal panel) dismisses it.
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toHaveCount(0);

    await page.locator(".add-button").click();
    await expect(overlay).toBeVisible();
    await page.locator(".modal-cancel").click();
    await expect(overlay).toHaveCount(0);

    expect(createRequested, "none of these three dismissals should ever submit")
      .toBe(false);
  });

  test("submit is blocked while the URL field is empty", async ({ page }) => {
    await installFixedClock(page);
    await signInAsOwner(page);
    await page.goto("/");

    await page.locator(".add-button").click();
    const overlay = page.locator(".modal-overlay");
    await expect(overlay).toBeVisible();

    let createRequested = false;
    await page.route("**/api/admin/articles", (route) => {
      if (route.request().method() === "POST") createRequested = true;
      route.continue();
    });

    // The URL field is `required` — clicking submit while empty must not
    // fire a request or close the dialog (native HTML5 validation blocks
    // the form's own submit event).
    await page.locator(".modal-submit").click();
    await expect(overlay).toBeVisible();
    expect(createRequested).toBe(false);
  });
});

test("a clean add closes the modal and inserts the new card at the top of the feed", async ({ page }) => {
  await installFixedClock(page);
  await signInAsOwner(page);
  await page.goto("/");

  await page.route("**/api/admin/articles", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "e2e-addmodal-fresh", status: "pending" }),
    });
  });

  await page.locator(".add-button").click();
  await page.locator("#add-modal-url").fill(NEW_URL);
  await page.locator("#add-modal-tags").fill("technology, science");

  // Wait for the intercepted response itself, not just the click — the
  // pagination fixture group's own pending "poll card" (see
  // pagination.spec.ts) keeps the feed's background poll timer running for
  // the whole suite, and under load a plain UI-settle assertion can lose the
  // race against it. Waiting on the actual POST response first makes the
  // rest of this test deterministic instead of timing-sensitive.
  await Promise.all([
    page.waitForResponse((res) =>
      res.url().includes("/api/admin/articles") &&
      res.request().method() === "POST"
    ),
    page.locator(".modal-submit").click(),
  ]);

  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  const card = page.locator('[data-article-id="e2e-addmodal-fresh"]');
  await expect(card).toBeVisible();
  // Optimistic local insert (see App.tsx's handleAdd) renders it as the
  // owner-add skeleton — added_via 'manual', so pendingCardVariant is
  // 'skeleton', not the agent-batch 'hidden' variant.
  await expect(card).toHaveClass(/card--skeleton/);
  await expect(page.locator("article").first()).toHaveAttribute(
    "data-article-id",
    "e2e-addmodal-fresh",
  );
});
