import { assertEquals } from "@std/assert";
import {
  fetchInitialPages,
  type PaginatedPage,
  shouldFetchNextInitialPage,
  shouldFetchOnEarlierExpand,
} from "./pagination.ts";

const NOW = new Date(2026, 6, 21, 15, 0, 0);
const today = (h: number) => new Date(2026, 6, 21, h).toISOString();
const yesterday = (h: number) => new Date(2026, 6, 20, h).toISOString();
const earlier = (h: number) => new Date(2026, 6, 19, h).toISOString();

Deno.test("shouldFetchNextInitialPage - null cursor always ends pagination", () => {
  assertEquals(shouldFetchNextInitialPage([{ added_at: today(9) }], null, NOW), false);
  assertEquals(shouldFetchNextInitialPage([], null, NOW), false);
});

Deno.test("shouldFetchNextInitialPage - keeps fetching while page is all today/yesterday", () => {
  const page = [{ added_at: today(9) }, { added_at: yesterday(20) }];
  assertEquals(shouldFetchNextInitialPage(page, "cursor-2", NOW), true);
});

Deno.test("shouldFetchNextInitialPage - stops as soon as an earlier item appears, even mid-page", () => {
  const page = [{ added_at: yesterday(1) }, { added_at: earlier(23) }];
  assertEquals(shouldFetchNextInitialPage(page, "cursor-2", NOW), false);
});

Deno.test("shouldFetchNextInitialPage - empty page with a cursor still keeps going", () => {
  assertEquals(shouldFetchNextInitialPage([], "cursor-2", NOW), true);
});

Deno.test("shouldFetchOnEarlierExpand - fetches on first expand when Earlier is empty and more data exists", () => {
  assertEquals(shouldFetchOnEarlierExpand(0, "cursor-3"), true);
});

Deno.test("shouldFetchOnEarlierExpand - no fetch when Earlier already has boundary-page items", () => {
  assertEquals(shouldFetchOnEarlierExpand(2, "cursor-3"), false);
});

Deno.test("shouldFetchOnEarlierExpand - no fetch when nothing more to load", () => {
  assertEquals(shouldFetchOnEarlierExpand(0, null), false);
});

Deno.test("shouldFetchOnEarlierExpand - show-more (already has items, cursor advances) is a separate action, not gated here", () => {
  // Show-more just calls the same fetch-more action unconditionally as long
  // as nextCursor isn't null and no fetch is already in flight — this
  // function only governs the *first*, expand-triggered fetch.
  assertEquals(shouldFetchOnEarlierExpand(5, "cursor-4"), false);
});

// --- fetchInitialPages: Task 49 regression coverage ---
// The loop itself (not just the shouldFetchNextInitialPage predicate it
// calls) is under test here — a fake, index-cursor-based paginator stands
// in for the real /api/articles endpoint.

interface FixtureItem {
  added_at: string;
}

function makePaginatedFetcher(
  allItems: FixtureItem[],
  pageSize: number,
): {
  fetchPage: (cursor: string | undefined) => Promise<PaginatedPage<FixtureItem>>;
  callCount: () => number;
} {
  let calls = 0;
  const fetchPage = (cursor: string | undefined): Promise<PaginatedPage<FixtureItem>> => {
    calls += 1;
    const start = cursor ? Number(cursor) : 0;
    const items = allItems.slice(start, start + pageSize);
    const nextStart = start + pageSize;
    const next_cursor = nextStart < allItems.length ? String(nextStart) : null;
    return Promise.resolve({ items, next_cursor });
  };
  return { fetchPage, callCount: () => calls };
}

// Minutes-ago offsets from NOW (2026-07-21 15:00 local) — avoids the hour-
// only precision of today()/yesterday()/earlier() above, which can't
// express 30+ distinct same-day timestamps.
function minutesAgo(mins: number): string {
  return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

Deno.test("fetchInitialPages: the incident's own numbers (19 today, 30 yesterday, page size 20) fetch exactly enough pages to cover both, then stop", async () => {
  const todayItems: FixtureItem[] = Array.from(
    { length: 19 },
    (_, i) => ({ added_at: minutesAgo(5 * (i + 1)) }), // 5..95 minutes ago, same local day
  );
  const yesterdayItems: FixtureItem[] = Array.from(
    { length: 30 },
    (_, i) => ({ added_at: minutesAgo(900 + 46 * (i + 1)) }), // spans local yesterday
  );
  const earlierItems: FixtureItem[] = Array.from(
    { length: 15 },
    (_, i) => ({ added_at: minutesAgo(2340 + 60 * (i + 1)) }), // before local yesterday
  );
  const allItems = [...todayItems, ...yesterdayItems, ...earlierItems];

  const { fetchPage, callCount } = makePaginatedFetcher(allItems, 20);
  const result = await fetchInitialPages(fetchPage, 25, { now: NOW });

  // 3 pages: page 1 (20 items: 19 today + 1 yesterday) and page 2 (20 more
  // yesterday items) are entirely today/yesterday, so the loop keeps going;
  // page 3 is the first to contain an "earlier" item (the tail of yesterday
  // plus the start of earlier), which is proof every prior item is
  // today/yesterday — the loop stops right there.
  assertEquals(callCount(), 3);
  assertEquals(result.cappedAt, null);
  // Every today+yesterday item made it in — nothing from the reported
  // incident's "only ~11 shown" truncation.
  const todayAndYesterdayIds = new Set([...todayItems, ...yesterdayItems].map((i) => i.added_at));
  const loadedIds = new Set(result.items.map((i) => i.added_at));
  for (const id of todayAndYesterdayIds) {
    assertEquals(loadedIds.has(id), true);
  }
});

Deno.test("fetchInitialPages: stops immediately when the very first page already reaches an 'earlier' item", async () => {
  const allItems: FixtureItem[] = [
    { added_at: minutesAgo(5) },
    { added_at: minutesAgo(2400) }, // already "earlier"
  ];
  const { fetchPage, callCount } = makePaginatedFetcher(allItems, 20);
  const result = await fetchInitialPages(fetchPage, 25, { now: NOW });
  assertEquals(callCount(), 1);
  assertEquals(result.cappedAt, null);
  assertEquals(result.items.length, 2);
});

Deno.test("fetchInitialPages: reports cappedAt (never silently claims coverage) when maxPages is exhausted first", async () => {
  // Every page is entirely "today" — shouldFetchNextInitialPage would keep
  // asking for more forever; the safety cap is what actually stops it.
  const allItems: FixtureItem[] = Array.from(
    { length: 100 },
    (_, i) => ({ added_at: minutesAgo(i + 1) }),
  );
  const { fetchPage, callCount } = makePaginatedFetcher(allItems, 20);
  const result = await fetchInitialPages(fetchPage, 3, { now: NOW });
  assertEquals(callCount(), 3);
  assertEquals(result.cappedAt, 3);
  assertEquals(result.items.length, 60);
});

Deno.test("fetchInitialPages: onPage fires progressively with the running total after each page", async () => {
  const allItems: FixtureItem[] = [
    { added_at: minutesAgo(5) },
    { added_at: minutesAgo(2400) },
  ];
  const { fetchPage } = makePaginatedFetcher(allItems, 1);
  const snapshots: number[] = [];
  await fetchInitialPages(fetchPage, 5, {
    now: NOW,
    onPage: (accumulated) => snapshots.push(accumulated.length),
  });
  assertEquals(snapshots, [1, 2]);
});

Deno.test("fetchInitialPages: isCancelled stops the loop from fetching further pages", async () => {
  const allItems: FixtureItem[] = Array.from(
    { length: 60 },
    (_, i) => ({ added_at: minutesAgo(i + 1) }), // all "today" — would keep going
  );
  const { fetchPage, callCount } = makePaginatedFetcher(allItems, 20);
  const result = await fetchInitialPages(fetchPage, 25, {
    now: NOW,
    isCancelled: () => callCount() >= 1,
  });
  assertEquals(callCount(), 1);
  assertEquals(result.cappedAt, null);
});
