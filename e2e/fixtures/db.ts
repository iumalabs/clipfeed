// Task 50: mid-test direct-SQL helper against the SAME local D1 the running
// `wrangler dev` (started by scripts/e2e/run.ts) is bound to — used only to
// simulate a pipeline completion (pending -> ready) for the poll-merge
// regression test, never to exercise the real pipeline (which would need a
// real Workers AI call — see scripts/e2e/seed-sql.ts's doc comment for why
// every fixture is inserted directly instead).
import { execFileSync } from "node:child_process";

const PERSIST_DIR = process.env.E2E_PERSIST_DIR ?? ".wrangler-e2e";
// scripts/e2e/run.ts always resolves --persist-to relative to the REPO ROOT
// (it runs `deno run` from there) — but this file runs inside the Playwright
// process, launched via `npm --prefix e2e test`, whose own cwd is `e2e/`. A
// bare relative path here would silently create/read a SEPARATE, empty D1
// under `e2e/.wrangler-e2e` instead of the one `wrangler dev` is actually
// serving from (confirmed empirically: "no such table: articles" the first
// time this ran) — passing `cwd` explicitly is what keeps both processes
// pointed at the exact same on-disk database regardless of npm's cwd.
const REPO_ROOT = new URL("../..", import.meta.url).pathname;

export function runSql(sql: string): void {
  execFileSync(
    "deno",
    [
      "run",
      "-A",
      "npm:wrangler",
      "d1",
      "execute",
      "clipfeed",
      "--local",
      `--persist-to=${PERSIST_DIR}`,
      `--command=${sql}`,
    ],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
}
