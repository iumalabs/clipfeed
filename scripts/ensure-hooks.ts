// Auto-activates the repo's pre-commit hook (scripts/git-hooks/pre-commit) the
// first time a contributor runs `deno task dev` or `deno task setup` — see
// README "Git hooks". Previously activation was a manual opt-in
// (`deno task hooks:install`) that nothing else ever prompted for, so anyone
// who skipped that one line never got the e2e-regression guard the hook
// exists for (this is what let a flaky-vs-real e2e gap go unnoticed locally
// during Task 58/59's CI investigation). Idempotent and non-destructive:
// never overwrites a hooksPath a developer already pointed elsewhere on
// purpose, and stays silent if this isn't a git checkout at all (e.g. a
// downloaded release zip has no .git to configure).

export const HOOKS_PATH = "scripts/git-hooks";

export type HookAction = "already-active" | "activate" | "leave-alone" | "not-a-git-repo";

export function decideHookAction(inGitRepo: boolean, currentHooksPath: string): HookAction {
  if (!inGitRepo) return "not-a-git-repo";
  if (currentHooksPath === HOOKS_PATH) return "already-active";
  if (currentHooksPath !== "") return "leave-alone";
  return "activate";
}

async function runGit(args: string[]): Promise<{ code: number; stdout: string }> {
  const command = new Deno.Command("git", {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await command.output();
  return { code, stdout: new TextDecoder().decode(stdout).trim() };
}

async function main(): Promise<void> {
  const inGitRepo = (await runGit(["rev-parse", "--is-inside-work-tree"])).code === 0;
  const currentHooksPath = inGitRepo ? (await runGit(["config", "core.hooksPath"])).stdout : "";

  switch (decideHookAction(inGitRepo, currentHooksPath)) {
    case "activate": {
      const result = await runGit(["config", "core.hooksPath", HOOKS_PATH]);
      if (result.code === 0) {
        console.log(
          `✓ Activated git hooks (core.hooksPath -> ${HOOKS_PATH}, see README "Git hooks")`,
        );
      }
      break;
    }
    case "leave-alone":
      console.warn(
        `Note: core.hooksPath is already set to "${currentHooksPath}" (not "${HOOKS_PATH}") — ` +
          "leaving it alone. Run `deno task hooks:install` to switch it manually.",
      );
      break;
    case "already-active":
    case "not-a-git-repo":
      break;
  }
}

if (import.meta.main) {
  await main();
}
