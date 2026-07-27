import type { ArticleListItem } from "@clipfeed/shared/types";
import { FAST_INTERVAL_MS, FAST_PHASE_MS, SLOW_INTERVAL_MS } from "./pollSchedule.ts";

// Task 41 Part A: replaces N independent per-card polls (one GET per pending
// article, every 4s) with a single feed-level poll that refreshes every
// pending card from one shared snapshot. This predicate is the "is there
// anything to poll for at all" gate — the timer in App.tsx only runs while
// it's true, and stops the instant it's false.
export function hasPendingArticles(articles: readonly Pick<ArticleListItem, "status">[]): boolean {
  return articles.some((a) => a.status === "pending");
}

// Same fast-then-slow cadence as the old per-card poll (lib/pollSchedule.ts's
// nextPollDelayMs), but never gives up — there is no per-poll "stuck" state
// at the feed level (each card still derives its own "given up" display from
// how long ITS OWN pending episode has run, see ArticleCard.tsx). The feed
// poll's only stop condition is hasPendingArticles going false.
export function feedPollDelayMs(elapsedMs: number): number {
  return elapsedMs < FAST_PHASE_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
}

// Refreshes every currently-pending card from a fresh list snapshot, by id,
// and surfaces brand-new arrivals. Two distinct behaviors:
//  - A row already in `current`: only touched if it's still pending — never
//    overwrites a row that already resolved locally (e.g. via a manual
//    "Check now" that beat this tick to the punch).
//  - A snapshot row with NO match in `current` at all: this is a genuinely
//    new article. The poll always fetches the unfiltered first page (newest
//    first, no cursor — see App.tsx), so anything here `current` doesn't
//    have yet is newer than everything already loaded; it's prepended,
//    preserving the snapshot's own newest-first order, rather than making
//    the user wait for a full reload to notice a new arrival. Never
//    truncates or reorders what was already there.
export function applyFeedPollSnapshot(
  current: readonly ArticleListItem[],
  snapshot: readonly ArticleListItem[],
): ArticleListItem[] {
  const bySnapshotId = new Map(snapshot.map((a) => [a.id, a] as const));
  const currentIds = new Set(current.map((a) => a.id));

  const refreshed = current.map((a) => {
    if (a.status !== "pending") return a;
    const fresh = bySnapshotId.get(a.id);
    return fresh ? { ...a, ...fresh } : a;
  });

  const brandNew = snapshot.filter((a) => !currentIds.has(a.id));
  return brandNew.length > 0 ? [...brandNew, ...refreshed] : refreshed;
}
