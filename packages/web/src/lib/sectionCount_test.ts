import { assertEquals } from "@std/assert";
import { resolveSectionCount } from "./sectionCount.ts";

Deno.test("resolveSectionCount: 'earlier' uses the server count when available, not the loaded count", () => {
  // The exact bug this fixes: 12 loaded, 92 on the server — the header
  // must show 92 from the start, not climb from 12 as more pages load.
  assertEquals(resolveSectionCount("earlier", 12, 92), 92);
});

Deno.test("resolveSectionCount: 'earlier' falls back to the loaded count when the server count is null", () => {
  assertEquals(resolveSectionCount("earlier", 12, null), 12);
});

Deno.test("resolveSectionCount: 'today'/'yesterday' always use the loaded count, even when a server count is available", () => {
  assertEquals(resolveSectionCount("today", 5, 92), 5);
  assertEquals(resolveSectionCount("yesterday", 8, 92), 8);
});
