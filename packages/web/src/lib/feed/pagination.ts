import { bucketSection } from "./dateGrouping.ts";

// The initial per-filter load fetches page after page until Today+Yesterday
// are fully covered, then stops — "Earlier" is lazy from there. Because the
// server orders `added_at DESC`, the first "earlier"-bucketed item seen in
// the stream is proof every item before it (this page and all prior ones)
// is today/yesterday: nothing later in a DESC stream can be newer. So the
// loop only needs to keep going while a page contains zero "earlier" items
// and the server says there's more to fetch.
export function shouldFetchNextInitialPage(
  pageItems: readonly { added_at: string }[],
  nextCursor: string | null,
  now: Date = new Date(),
): boolean {
  if (nextCursor === null) return false;
  return pageItems.every((item) => bucketSection(item.added_at, now) !== "earlier");
}

// "Earlier" starts collapsed; its first page loads only once the user
// expands it. If the initial-load loop above already picked up some
// "earlier" items as the tail of a boundary page, no extra fetch is needed
// on that first expand — only fetch when Earlier is still genuinely empty
// but the server has more data to give (nextCursor !== null).
export function shouldFetchOnEarlierExpand(
  earlierItemCount: number,
  nextCursor: string | null,
): boolean {
  return earlierItemCount === 0 && nextCursor !== null;
}

export interface PaginatedPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface FetchInitialPagesResult<T> {
  items: T[];
  nextCursor: string | null;
  // Non-null only when the loop stopped because it hit `maxPages` without
  // shouldFetchNextInitialPage ever returning false — i.e. Today+Yesterday
  // were NOT confirmed fully covered. Real daily volume is nowhere near this
  // many pages (see App.tsx's MAX_INITIAL_PAGES comment); the caller logs
  // this rather than silently pretending coverage was complete.
  cappedAt: number | null;
}

// Task 49: the "keep fetching until Today+Yesterday are covered" loop,
// extracted as pure logic decoupled from React state and the real network
// call — a test against this function is a genuine regression lock for
// App.tsx's initial-load effect, not a reimplementation that can drift from
// it. `onPage` fires after each page is folded into the running total (so
// callers can render progressively, matching the original inline-loop
// behavior); `isCancelled` is checked right after each fetch resolves so an
// aborted effect (e.g. the user changed filters mid-load) stops requesting
// further pages instead of continuing in the background.
export async function fetchInitialPages<T extends { added_at: string }>(
  fetchPage: (cursor: string | undefined) => Promise<PaginatedPage<T>>,
  maxPages: number,
  options: {
    onPage?: (accumulated: T[], nextCursor: string | null) => void;
    isCancelled?: () => boolean;
    now?: Date;
  } = {},
): Promise<FetchInitialPagesResult<T>> {
  const { onPage, isCancelled, now = new Date() } = options;
  let cursor: string | undefined;
  let accumulated: T[] = [];
  let nextCursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(cursor);
    if (isCancelled?.()) return { items: accumulated, nextCursor, cappedAt: null };

    accumulated = accumulated.concat(res.items);
    nextCursor = res.next_cursor;
    onPage?.(accumulated, nextCursor);

    if (!shouldFetchNextInitialPage(res.items, res.next_cursor, now)) {
      return { items: accumulated, nextCursor, cappedAt: null };
    }
    if (page === maxPages - 1) {
      return { items: accumulated, nextCursor, cappedAt: maxPages };
    }
    cursor = res.next_cursor ?? undefined;
  }
  return { items: accumulated, nextCursor, cappedAt: maxPages };
}
