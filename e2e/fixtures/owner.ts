// Task 50: simulates a signed-in owner without real Cloudflare Access (which
// can't run against a local `wrangler dev`) — attaches the same header the
// LOCAL-ONLY E2E_TEST_MODE bypass checks for (see
// packages/api/src/auth/access-middleware.ts's e2eTestModeBypass). The
// harness (scripts/e2e/run.ts) is the only thing that ever sets
// E2E_TEST_MODE=true on the worker itself; this header alone, against a
// worker NOT running in that mode, is always inert — see the access-
// middleware_test.ts inertness suite for the server-side half of that proof.
import type { Page } from "@playwright/test";

const E2E_OWNER_HEADER = "X-E2E-Test-Owner";
const E2E_OWNER_HEADER_VALUE = "clipfeed-e2e";

export async function signInAsOwner(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_OWNER_HEADER]: E2E_OWNER_HEADER_VALUE });
}
