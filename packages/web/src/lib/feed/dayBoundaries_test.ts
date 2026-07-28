import { assertEquals } from "@std/assert";
import { computeDayBoundaries } from "./dayBoundaries.ts";
import { bucketSection } from "./dateGrouping.ts";

// Fixed "now" for deterministic tests: 2026-07-21 15:00 local time — same
// fixture dateGrouping_test.ts uses, so boundary math is checked against
// the exact same reference point bucketSection's own tests use.
const NOW = new Date(2026, 6, 21, 15, 0, 0);

Deno.test("computeDayBoundaries: todayStart is local midnight of `now`, as a UTC ISO instant", () => {
  const { todayStart } = computeDayBoundaries(NOW);
  const localMidnight = new Date(2026, 6, 21, 0, 0, 0, 0);
  assertEquals(todayStart, localMidnight.toISOString());
});

Deno.test("computeDayBoundaries: yesterdayStart is local midnight of the previous calendar day", () => {
  const { yesterdayStart } = computeDayBoundaries(NOW);
  const localMidnight = new Date(2026, 6, 20, 0, 0, 0, 0);
  assertEquals(yesterdayStart, localMidnight.toISOString());
});

Deno.test("computeDayBoundaries: month boundary — yesterday is the last day of the previous month", () => {
  const firstOfMonth = new Date(2026, 6, 1, 10, 0);
  const { yesterdayStart } = computeDayBoundaries(firstOfMonth);
  assertEquals(yesterdayStart, new Date(2026, 5, 30, 0, 0, 0, 0).toISOString());
});

// --- Cross-check against bucketSection: every article added_at right at
// (or just either side of) a computed boundary must fall into the section
// dayBoundaries.ts's own name implies — this is the actual invariant the
// server-side counts endpoint depends on (see db.ts's getArticleCounts):
// the client's boundaries and the client's own local-day bucketing must
// agree, or the server count would silently disagree with what the SPA
// renders. ---

Deno.test("computeDayBoundaries agrees with bucketSection: an article exactly at todayStart is 'today'", () => {
  const { todayStart } = computeDayBoundaries(NOW);
  assertEquals(bucketSection(todayStart, NOW), "today");
});

Deno.test("computeDayBoundaries agrees with bucketSection: an article 1ms before todayStart is 'yesterday'", () => {
  const { todayStart } = computeDayBoundaries(NOW);
  const justBefore = new Date(new Date(todayStart).getTime() - 1).toISOString();
  assertEquals(bucketSection(justBefore, NOW), "yesterday");
});

Deno.test("computeDayBoundaries agrees with bucketSection: an article exactly at yesterdayStart is 'yesterday'", () => {
  const { yesterdayStart } = computeDayBoundaries(NOW);
  assertEquals(bucketSection(yesterdayStart, NOW), "yesterday");
});

Deno.test("computeDayBoundaries agrees with bucketSection: an article 1ms before yesterdayStart is 'earlier'", () => {
  const { yesterdayStart } = computeDayBoundaries(NOW);
  const justBefore = new Date(new Date(yesterdayStart).getTime() - 1).toISOString();
  assertEquals(bucketSection(justBefore, NOW), "earlier");
});

Deno.test("computeDayBoundaries: defaults `now` to the real current time when omitted", () => {
  const before = Date.now();
  const { todayStart } = computeDayBoundaries();
  const after = Date.now();
  const boundaryMs = new Date(todayStart).getTime();
  // Local midnight of "now" is always <= "now" itself, and can't be more
  // than 24h in the past.
  assertEquals(boundaryMs <= after, true);
  assertEquals(boundaryMs > before - 24 * 60 * 60 * 1000, true);
});
