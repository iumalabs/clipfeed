import { assertEquals } from "@std/assert";
import { applyFeedPollSnapshot, feedPollDelayMs, hasPendingArticles } from "./feedPoll.ts";
import { FAST_INTERVAL_MS, FAST_PHASE_MS, SLOW_INTERVAL_MS } from "./pollSchedule.ts";
import type { ArticleListItem } from "@clipfeed/shared/types";

function item(status: "pending" | "ready" | "failed"): Pick<ArticleListItem, "status"> {
  return { status };
}

// --- hasPendingArticles ---

Deno.test("hasPendingArticles: false for an empty list", () => {
  assertEquals(hasPendingArticles([]), false);
});

Deno.test("hasPendingArticles: false when nothing is pending", () => {
  assertEquals(hasPendingArticles([item("ready"), item("failed")]), false);
});

Deno.test("hasPendingArticles: true when any single item is pending, regardless of count", () => {
  assertEquals(
    hasPendingArticles([item("ready"), item("pending"), item("ready")]),
    true,
  );
});

Deno.test("hasPendingArticles: true when everything is pending", () => {
  assertEquals(hasPendingArticles([item("pending"), item("pending")]), true);
});

// --- feedPollDelayMs: cadence transition, never gives up ---

Deno.test("feedPollDelayMs: fast interval before the phase boundary", () => {
  assertEquals(feedPollDelayMs(0), FAST_INTERVAL_MS);
  assertEquals(feedPollDelayMs(FAST_PHASE_MS - 1), FAST_INTERVAL_MS);
});

Deno.test("feedPollDelayMs: slow interval at and after the phase boundary", () => {
  assertEquals(feedPollDelayMs(FAST_PHASE_MS), SLOW_INTERVAL_MS);
  assertEquals(feedPollDelayMs(FAST_PHASE_MS * 100), SLOW_INTERVAL_MS);
});

Deno.test("feedPollDelayMs: never returns null, unlike the per-card nextPollDelayMs", () => {
  // Ten hours in — the old per-card poll would have given up long ago.
  assertEquals(feedPollDelayMs(10 * 60 * 60 * 1000), SLOW_INTERVAL_MS);
});

// --- applyFeedPollSnapshot ---

function article(overrides: Partial<ArticleListItem>): ArticleListItem {
  return {
    id: "a1",
    url: "https://example.com/a1",
    canonical_url: null,
    title: "Example",
    source: "example.com",
    author: null,
    published_at: null,
    added_at: "2026-01-01T00:00:00.000Z",
    added_via: "manual",
    lang_original: "en",
    summary_ru: null,
    summary_en: null,
    summary_json: null,
    tags: [],
    status: "pending",
    archived: false,
    error: null,
    fail_class: null,
    heal_attempts: 0,
    faithfulness_verdict: null,
    faithfulness_json: null,
    faithfulness_checked_at: null,
    embedded_at: null,
    telegram_published_at: null,
    en_generated_at: null,
    image_key: null,
    image_source_url: null,
    image_width: null,
    image_height: null,
    processing_started_at: null,
    faithfulness_enforced_at: null,
    ...overrides,
  };
}

Deno.test("applyFeedPollSnapshot: a pending row present in the snapshot is refreshed in place", () => {
  const current = [article({ id: "a1", status: "pending" })];
  const snapshot = [article({ id: "a1", status: "ready", summary_ru: "done" })];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result[0].status, "ready");
  assertEquals(result[0].summary_ru, "done");
});

Deno.test("applyFeedPollSnapshot: a non-pending row is left untouched even if the snapshot has a different copy", () => {
  const current = [article({ id: "a1", status: "ready", summary_ru: "original" })];
  const snapshot = [article({ id: "a1", status: "ready", summary_ru: "different" })];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result[0].summary_ru, "original");
});

Deno.test("applyFeedPollSnapshot: a pending row absent from the snapshot (e.g. beyond the fetched page) is left untouched", () => {
  const current = [article({ id: "a1", status: "pending" })];
  const result = applyFeedPollSnapshot(current, []);
  assertEquals(result[0].status, "pending");
});

// Task 49: a snapshot row with no match in `current` is a genuinely new
// arrival (the poll always fetches the unfiltered newest-first first page —
// see App.tsx) and gets prepended, rather than silently dropped.
Deno.test("applyFeedPollSnapshot: a snapshot row not already in `current` is prepended as a new arrival", () => {
  const current = [article({ id: "a1", status: "pending" })];
  const snapshot = [
    article({ id: "a2", status: "ready", title: "Brand new" }),
    article({ id: "a1", status: "pending" }),
  ];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result.map((a) => a.id), ["a2", "a1"]);
  assertEquals(result[0].title, "Brand new");
});

Deno.test("applyFeedPollSnapshot: multiple new arrivals are prepended in the snapshot's own (newest-first) order", () => {
  const current = [article({ id: "a1", status: "ready" })];
  const snapshot = [
    article({ id: "a3", status: "ready" }),
    article({ id: "a2", status: "ready" }),
    article({ id: "a1", status: "ready" }),
  ];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result.map((a) => a.id), ["a3", "a2", "a1"]);
});

Deno.test("applyFeedPollSnapshot: no new arrivals means the list is returned unchanged in length and order", () => {
  const current = [
    article({ id: "a1", status: "ready" }),
    article({ id: "a2", status: "ready" }),
  ];
  const snapshot = [article({ id: "a1", status: "ready" }), article({ id: "a2", status: "ready" })];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result.map((a) => a.id), ["a1", "a2"]);
});

Deno.test("applyFeedPollSnapshot: updates every pending row regardless of how many there are, from one snapshot", () => {
  const current = [
    article({ id: "a1", status: "pending" }),
    article({ id: "a2", status: "pending" }),
    article({ id: "a3", status: "pending" }),
  ];
  const snapshot = [
    article({ id: "a1", status: "ready" }),
    article({ id: "a2", status: "failed" }),
    article({ id: "a3", status: "pending" }),
  ];
  const result = applyFeedPollSnapshot(current, snapshot);
  assertEquals(result.map((a) => a.status), ["ready", "failed", "pending"]);
});

// --- Task 49 regression coverage ---

Deno.test("applyFeedPollSnapshot: items appended by 'Показать ещё' (show more) survive a subsequent poll tick untouched", () => {
  // Simulates the real sequence: initial load produced 2 items, the user
  // clicked "show more" and 2 more (older, already-ready) items were
  // appended locally (handleShowMore's `[...current, ...res.items]`) — a
  // poll snapshot covering only the newest page must never drop the
  // show-more items just because they're absent from that snapshot.
  const afterShowMore = [
    article({ id: "p1", status: "pending" }),
    article({ id: "r1", status: "ready" }),
    article({ id: "older1", status: "ready", title: "Loaded via show more" }),
    article({ id: "older2", status: "ready", title: "Loaded via show more" }),
  ];
  const pollSnapshot = [
    article({ id: "p1", status: "ready", title: "Now ready" }),
    article({ id: "r1", status: "ready" }),
  ];
  const result = applyFeedPollSnapshot(afterShowMore, pollSnapshot);
  assertEquals(result.map((a) => a.id), ["p1", "r1", "older1", "older2"]);
  assertEquals(result[0].title, "Now ready");
  assertEquals(result[2].title, "Loaded via show more");
  assertEquals(result[3].title, "Loaded via show more");
});

// Regression test for Task 49's "feed shows only one page" incident: a poll
// snapshot (always just the first/newest page — see App.tsx) must never
// shrink an accumulated list that's already grown past a single page via
// the initial multi-page load and/or "show more" — the exact failure mode
// reported (feed showed ~11 while the database held 97).
Deno.test("applyFeedPollSnapshot: Task 49 regression — a first-page snapshot never truncates a much longer accumulated list", () => {
  const longAccumulated = Array.from({ length: 60 }, (_, i) =>
    article({
      id: `article-${i}`,
      status: i === 0 ? "pending" : "ready",
      title: `Article ${i}`,
    }));
  // The poll only ever fetches PAGE_LIMIT (20) newest items — far fewer
  // than the 60 already accumulated across multiple pages.
  const firstPageSnapshot = longAccumulated.slice(0, 20).map((a) =>
    a.id === "article-0" ? { ...a, status: "ready" as const, title: "Article 0 (done)" } : a
  );
  const result = applyFeedPollSnapshot(longAccumulated, firstPageSnapshot);
  assertEquals(result.length, 60);
  assertEquals(result.map((a) => a.id), longAccumulated.map((a) => a.id));
  assertEquals(result[0].status, "ready");
  assertEquals(result[0].title, "Article 0 (done)");
});
