import { assertEquals } from "@std/assert";
import { decideHookAction, HOOKS_PATH } from "./ensure-hooks.ts";

Deno.test("decideHookAction: not a git repo -> no-op regardless of hooksPath", () => {
  assertEquals(decideHookAction(false, ""), "not-a-git-repo");
  assertEquals(decideHookAction(false, HOOKS_PATH), "not-a-git-repo");
});

Deno.test("decideHookAction: unset hooksPath in a git repo -> activate", () => {
  assertEquals(decideHookAction(true, ""), "activate");
});

Deno.test("decideHookAction: hooksPath already the target -> already-active, no-op", () => {
  assertEquals(decideHookAction(true, HOOKS_PATH), "already-active");
});

Deno.test("decideHookAction: hooksPath set to something else -> leave-alone, never clobbered", () => {
  assertEquals(decideHookAction(true, "custom/hooks"), "leave-alone");
  assertEquals(decideHookAction(true, ".husky"), "leave-alone");
});
