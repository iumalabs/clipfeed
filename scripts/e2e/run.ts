// Task 50: `deno task e2e` orchestrator — boots a throwaway local worker,
// seeds deterministic fixtures, runs the Playwright suite (e2e/, a Node
// sidecar — see the PR description for why Playwright runs under Node
// rather than Deno's npm compat), then tears everything down.
//
// Isolation from a developer's own `deno task dev` session is the whole
// point of E2E_PERSIST_DIR: this NEVER touches `.wrangler/state` (the
// directory `deno task dev` reads/writes), so running the suite can't wipe
// or corrupt a developer's local manually-added test articles. Everything
// this script writes lives under `.wrangler-e2e/`, itself gitignored.
import { buildSeedSql } from "./seed-sql.ts";

const PORT = Deno.env.get("E2E_PORT") ?? "8799";
const PERSIST_DIR = Deno.env.get("E2E_PERSIST_DIR") ?? ".wrangler-e2e";
const BASE_URL = `http://localhost:${PORT}`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 1000;

// The stale-pending sweeper (db.ts's sweepStalePending) measures against the
// REAL wall clock, not the fixed browser clock the SPA sees — e2e/fixtures/
// fixed-now.json pins the SPA's notion of "now" to a fixed CALENDAR date
// (so date-section bucketing is deterministic regardless of when the suite
// actually runs — see clock.ts), which drifts further from the real date
// every day this repo exists. A fixture's `added_at`, computed relative to
// that fixed date, can therefore be an ever-growing number of REAL days in
// the past by the time this runs — nowhere near stale in the sense the
// sweeper cares about, but a finite override (even a generous one) still
// gets defeated eventually as that drift grows. An effectively-unbounded
// override sidesteps needing to keep this in sync with the fixed date at
// all: ~1900 years comfortably exceeds any realistic gap for the lifetime of
// this repo.
//
// `wrangler dev --var` does NOT override a value already declared in
// wrangler.toml's [vars] (confirmed empirically while building this harness —
// the CLI override is silently ignored for keys the config file already
// sets). The only reliable override is a real config file, so this generates
// a throwaway copy of wrangler.toml with just these two lines patched, and
// every wrangler invocation below uses `--config` to point at it instead.
// It's written into the REPO ROOT (not a temp dir) because `main`/[assets]
// directory/`migrations_dir` in wrangler.toml are relative paths resolved
// against the CONFIG FILE's own location, not the process cwd — placing the
// copy anywhere else breaks those paths (confirmed empirically: "entry-point
// file ... was not found" when the copy lived under /tmp).
const E2E_WRANGLER_CONFIG = "wrangler.e2e.toml";
const NEVER_SWEEP_MINUTES = 999_999_999;

function run(cmd: string[], opts: Deno.CommandOptions = {}): Promise<Deno.CommandOutput> {
  console.log(`$ ${cmd.join(" ")}`);
  return new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
    ...opts,
  })
    .output();
}

async function writeE2EWranglerConfig(): Promise<void> {
  const original = await Deno.readTextFile("wrangler.toml");
  const patched = original
    .replace(/^PENDING_TIMEOUT_MIN = \d+$/m, `PENDING_TIMEOUT_MIN = ${NEVER_SWEEP_MINUTES}`)
    .replace(/^QUEUE_WAIT_TIMEOUT_MIN = \d+$/m, `QUEUE_WAIT_TIMEOUT_MIN = ${NEVER_SWEEP_MINUTES}`);
  if (patched === original) {
    throw new Error(
      "writeE2EWranglerConfig: neither PENDING_TIMEOUT_MIN nor QUEUE_WAIT_TIMEOUT_MIN matched in wrangler.toml — check the pattern still matches after any config changes",
    );
  }
  await Deno.writeTextFile(E2E_WRANGLER_CONFIG, patched);
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        await res.body?.cancel();
        return;
      }
      await res.body?.cancel();
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(
    `worker never became healthy at ${BASE_URL}/api/health within ${HEALTH_TIMEOUT_MS}ms`,
  );
}

async function killWranglerDev(): Promise<void> {
  // Belt-and-braces: `wrangler dev` forks a workerd subprocess of its own —
  // killing only the top-level pid can leave that orphaned. Matching on the
  // exact command line (this port + persist dir are unique to this run)
  // reliably catches both.
  try {
    await new Deno.Command("pkill", {
      args: ["-f", `wrangler dev --config ${E2E_WRANGLER_CONFIG} --port ${PORT}`],
    }).output();
  } catch {
    // pkill not available or nothing matched — not fatal, just best effort.
  }
}

// Returns the Playwright suite's exit code — never calls Deno.exit() itself,
// so every `finally` block below (including the caller's own config-file
// cleanup) always actually runs. Deno.exit() unwinds the whole process
// immediately, skipping any pending finally blocks further up the call
// stack — calling it from inside a nested try here previously left
// wrangler.e2e.toml behind on every single run (confirmed empirically).
async function main(): Promise<number> {
  console.log(`Task 50 E2E harness: port=${PORT} persistDir=${PERSIST_DIR}`);

  const buildResult = await run(["deno", "run", "-A", "scripts/build.ts"]);
  if (!buildResult.success) throw new Error("build failed");

  await writeE2EWranglerConfig();

  try {
    const migrateResult = await run([
      "deno",
      "run",
      "-A",
      "npm:wrangler",
      "d1",
      "migrations",
      "apply",
      "clipfeed",
      "--local",
      `--persist-to=${PERSIST_DIR}`,
      `--config=${E2E_WRANGLER_CONFIG}`,
    ]);
    if (!migrateResult.success) throw new Error("D1 migration apply failed");

    const seedSql = buildSeedSql();
    const seedFile = await Deno.makeTempFile({ suffix: ".sql" });
    await Deno.writeTextFile(seedFile, seedSql);
    try {
      const seedResult = await run([
        "deno",
        "run",
        "-A",
        "npm:wrangler",
        "d1",
        "execute",
        "clipfeed",
        "--local",
        `--persist-to=${PERSIST_DIR}`,
        `--config=${E2E_WRANGLER_CONFIG}`,
        `--file=${seedFile}`,
      ]);
      if (!seedResult.success) throw new Error("seed failed");
    } finally {
      await Deno.remove(seedFile).catch(() => {});
    }

    console.log("Starting wrangler dev...");
    const devProcess = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "npm:wrangler",
        "dev",
        "--config",
        E2E_WRANGLER_CONFIG,
        "--port",
        PORT,
        `--persist-to=${PERSIST_DIR}`,
        "--var",
        "E2E_TEST_MODE:true",
      ],
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();

    let testExitCode = 1;
    try {
      await waitForHealth();
      console.log("Worker healthy — running Playwright suite...");

      const npmInstallResult = await run(["npm", "--prefix", "e2e", "install"]);
      if (!npmInstallResult.success) throw new Error("npm install (e2e/) failed");

      const testResult = await run(["npm", "--prefix", "e2e", "test"], {
        env: { ...Deno.env.toObject(), BASE_URL, E2E_PERSIST_DIR: PERSIST_DIR },
      });
      testExitCode = testResult.success ? 0 : 1;
    } finally {
      console.log("Tearing down wrangler dev...");
      try {
        devProcess.kill("SIGTERM");
      } catch {
        // Already exited — fine.
      }
      await devProcess.status.catch(() => {});
      await killWranglerDev();
    }

    return testExitCode;
  } finally {
    await Deno.remove(E2E_WRANGLER_CONFIG).catch(() => {});
  }
}

Deno.exit(await main());
