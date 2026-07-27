// Task 50: builds the deterministic SQL fixture set for `deno task e2e`.
// Every row this produces is inserted directly (never through the real
// pipeline, which would enqueue a Workers AI call against the real Cloudflare
// account even in local `wrangler dev` — see the harness's own doc comment in
// scripts/e2e/run.ts) so the whole suite runs with zero external network
// dependency and zero real cost.
//
// Timestamps are all computed relative to a single fixed "now" (see
// e2e/fixtures/fixed-now.json), which the Playwright side also installs as
// the browser's clock (page.clock) before navigating — so the SPA's
// local-calendar-day section bucketing (today/yesterday/earlier, see
// packages/web/src/lib/dateGrouping.ts) is exercised with a value both sides
// agree on, never the real wall clock.
//
// Only the "pagination" fixture group actually lands in Today/Yesterday —
// every other group's rows are pinned well into "earlier" (30+ days back) so
// they can never perturb the pagination test's exact section counts. Each
// group also gets its own distinct tag/source so a test can identify its own
// rows unambiguously even though every group shares one seeded database.

import fixedNow from "../../e2e/fixtures/fixed-now.json" with { type: "json" };

const NOW = new Date(fixedNow.fixedNowIso);

function isoMinutesAgo(mins: number): string {
  return new Date(NOW.getTime() - mins * 60_000).toISOString();
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  return sqlString(JSON.stringify(value));
}

interface ArticleRow {
  id: string;
  url: string;
  title: string;
  source: string;
  added_at: string;
  added_via: string;
  status: "pending" | "ready" | "failed";
  tags: string[];
  summary_json?: Record<string, unknown> | null;
  summary_ru?: string | null;
  error?: string | null;
  fail_class?: string | null;
  en_generated_at?: string | null;
}

function summaryFor(title: string, tldr: string): Record<string, unknown> {
  return {
    title_ru: title,
    tldr_ru: tldr,
    body_ru: [`${title}: полный текст абзаца для проверки.`],
    bullets_ru: ["Пункт первый.", "Пункт второй."],
    tags: [],
    lang_original: "ru",
  };
}

function insertStatement(row: ArticleRow): string {
  const summaryJson = row.summary_json ?? null;
  const columns = [
    "id",
    "url",
    "title",
    "source",
    "added_at",
    "added_via",
    "status",
    "archived",
    "tags",
    "summary_ru",
    "summary_json",
    "error",
    "fail_class",
    "en_generated_at",
  ];
  const values = [
    sqlString(row.id),
    sqlString(row.url),
    sqlString(row.title),
    sqlString(row.source),
    sqlString(row.added_at),
    sqlString(row.added_via),
    sqlString(row.status),
    "0",
    sqlJson(row.tags),
    row.summary_ru ? sqlString(row.summary_ru) : "NULL",
    summaryJson ? sqlJson(summaryJson) : "NULL",
    row.error !== undefined && row.error !== null ? sqlString(row.error) : "NULL",
    row.fail_class ? sqlString(row.fail_class) : "NULL",
    row.en_generated_at ? sqlString(row.en_generated_at) : "NULL",
  ];
  return `INSERT INTO articles (${columns.join(", ")}) VALUES (${values.join(", ")});`;
}

// --- Group 1: pagination (Task 49 regression) ---
// 19 today + 30 yesterday + 20 earlier, page size 20 — the incident's own
// numbers. Plus one manually-added pending row seeded "today" that the test
// flips to ready mid-run (via scripts/e2e/db-update.ts) to exercise the feed
// poll's merge-without-truncation guarantee.
const PAGINATION_SOURCE = "e2e-pagination.example.com";
const PAGINATION_TAG = "e2e-pagination";

function paginationRows(): ArticleRow[] {
  const rows: ArticleRow[] = [];
  for (let i = 0; i < 19; i++) {
    rows.push({
      id: `e2e-page-today-${i}`,
      url: `https://${PAGINATION_SOURCE}/today/${i}`,
      title: `Pagination today #${i}`,
      source: PAGINATION_SOURCE,
      added_at: isoMinutesAgo(5 * (i + 1)),
      added_via: "manual",
      status: "ready",
      tags: [PAGINATION_TAG],
      summary_json: summaryFor(`Pagination today #${i}`, "Сегодняшняя статья для теста пагинации."),
      summary_ru: "Сегодняшняя статья для теста пагинации.",
    });
  }
  for (let i = 0; i < 30; i++) {
    rows.push({
      id: `e2e-page-yesterday-${i}`,
      url: `https://${PAGINATION_SOURCE}/yesterday/${i}`,
      title: `Pagination yesterday #${i}`,
      source: PAGINATION_SOURCE,
      added_at: isoMinutesAgo(1500 + 20 * (i + 1)),
      added_via: "manual",
      status: "ready",
      tags: [PAGINATION_TAG],
      summary_json: summaryFor(
        `Pagination yesterday #${i}`,
        "Вчерашняя статья для теста пагинации.",
      ),
      summary_ru: "Вчерашняя статья для теста пагинации.",
    });
  }
  for (let i = 0; i < 20; i++) {
    rows.push({
      id: `e2e-page-earlier-${i}`,
      url: `https://${PAGINATION_SOURCE}/earlier/${i}`,
      title: `Pagination earlier #${i}`,
      source: PAGINATION_SOURCE,
      added_at: isoMinutesAgo(3200 + 30 * (i + 1)),
      added_via: "manual",
      status: "ready",
      tags: [PAGINATION_TAG],
      summary_json: summaryFor(
        `Pagination earlier #${i}`,
        "Более старая статья для теста пагинации.",
      ),
      summary_ru: "Более старая статья для теста пагинации.",
    });
  }
  rows.push({
    id: "e2e-page-pollcard",
    url: `https://${PAGINATION_SOURCE}/poll/0`,
    title: "Pagination poll card (still pending)",
    source: PAGINATION_SOURCE,
    added_at: isoMinutesAgo(1),
    added_via: "manual",
    status: "pending",
    tags: [PAGINATION_TAG],
  });
  return rows;
}

// --- Group 2: EN translate gating (Task 40 regression) ---
// 3 rows that already have an English edition (must NEVER be re-requested)
// and 10 that don't (only the ones actually scrolled into view should ever
// be requested) — enough "needsEnglish" rows that a small viewport can't fit
// them all, so the viewport gate is genuinely exercised.
const TRANSLATE_SOURCE = "e2e-translate.example.com";
const TRANSLATE_TAG = "e2e-translate";

function translateRows(): ArticleRow[] {
  const rows: ArticleRow[] = [];
  for (let i = 0; i < 3; i++) {
    rows.push({
      id: `e2e-translate-hasen-${i}`,
      url: `https://${TRANSLATE_SOURCE}/hasen/${i}`,
      title: `Translate hasEnglish #${i}`,
      source: TRANSLATE_SOURCE,
      // Just past pagination's own "earlier" rows (which end at ~3800 min
      // ago — see paginationRows) so every group's fixtures load within a
      // couple of "Show more" clicks, never 30+ days deep.
      added_at: isoMinutesAgo(4300 + 10 * i),
      added_via: "manual",
      status: "ready",
      tags: [TRANSLATE_TAG],
      summary_json: {
        ...summaryFor(`Translate hasEnglish #${i}`, "У этой статьи уже есть английский перевод."),
        title_en: `Translate hasEnglish #${i} (EN)`,
        tldr_en: "This article already has an English edition.",
        body_en: ["Full English paragraph."],
        bullets_en: ["Point one.", "Point two."],
      },
      summary_ru: "У этой статьи уже есть английский перевод.",
      en_generated_at: isoMinutesAgo(4300 + 10 * i),
    });
  }
  for (let i = 0; i < 10; i++) {
    rows.push({
      id: `e2e-translate-needsen-${i}`,
      url: `https://${TRANSLATE_SOURCE}/needsen/${i}`,
      title: `Translate needsEnglish #${i}`,
      source: TRANSLATE_SOURCE,
      added_at: isoMinutesAgo(4400 + 10 * i),
      added_via: "manual",
      status: "ready",
      tags: [TRANSLATE_TAG],
      summary_json: summaryFor(`Translate needsEnglish #${i}`, "Эта статья пока без английского."),
      summary_ru: "Эта статья пока без английского.",
    });
  }
  return rows;
}

// --- Group 3: owner vs visitor ---
const OWNERVIS_SOURCE = "e2e-ownervis.example.com";
const OWNERVIS_TAG = "e2e-ownervis";

function ownerVisitorRows(): ArticleRow[] {
  return [
    {
      id: "e2e-ownervis-ready",
      url: `https://${OWNERVIS_SOURCE}/ready`,
      title: "Owner/visitor ready article",
      source: OWNERVIS_SOURCE,
      added_at: isoMinutesAgo(3900),
      added_via: "manual",
      status: "ready",
      tags: [OWNERVIS_TAG],
      summary_json: summaryFor("Owner/visitor ready article", "Готовая статья, видна всем."),
      summary_ru: "Готовая статья, видна всем.",
    },
    {
      id: "e2e-ownervis-pending",
      url: `https://${OWNERVIS_SOURCE}/pending`,
      title: "Owner/visitor pending article",
      source: OWNERVIS_SOURCE,
      added_at: isoMinutesAgo(3910),
      added_via: "manual",
      status: "pending",
      tags: [OWNERVIS_TAG],
    },
    {
      id: "e2e-ownervis-failed",
      url: `https://${OWNERVIS_SOURCE}/failed`,
      title: "Owner/visitor failed article",
      source: OWNERVIS_SOURCE,
      added_at: isoMinutesAgo(3920),
      added_via: "manual",
      status: "failed",
      tags: [OWNERVIS_TAG],
      error: "internal: extract: fetch failed with status 500",
      fail_class: "transient",
    },
  ];
}

// --- Group 4: keyword search (Russian morphology) ---
// "кабели" (plural of "кабель", cable) — querying the singular stem must
// still match this row (see packages/api/src/search/ru-stemmer.ts).
const SEARCH_SOURCE = "e2e-search.example.com";
const SEARCH_TAG = "e2e-search";

function searchRows(): ArticleRow[] {
  return [
    {
      id: "e2e-search-cables",
      url: `https://${SEARCH_SOURCE}/cables`,
      title: "Новые сетевые кабели для дата-центров",
      source: SEARCH_SOURCE,
      added_at: isoMinutesAgo(4000),
      added_via: "manual",
      status: "ready",
      tags: [SEARCH_TAG],
      summary_json: summaryFor(
        "Новые сетевые кабели для дата-центров",
        "Обзор новых кабелей для дата-центров.",
      ),
      summary_ru: "Обзор новых кабелей для дата-центров.",
    },
    {
      id: "e2e-search-unrelated",
      url: `https://${SEARCH_SOURCE}/unrelated`,
      title: "Совершенно не связанная статья",
      source: SEARCH_SOURCE,
      added_at: isoMinutesAgo(4010),
      added_via: "manual",
      status: "ready",
      tags: [SEARCH_TAG],
      summary_json: summaryFor("Совершенно не связанная статья", "Ничего общего с запросом."),
      summary_ru: "Ничего общего с запросом.",
    },
  ];
}

// --- Group 5: deep link + logo reset ---
const DEEPLINK_SOURCE = "e2e-deeplink.example.com";
const DEEPLINK_TAG = "e2e-deeplink";
export const DEEPLINK_ARTICLE_ID = "e2e-deeplink-target";

function deepLinkRows(): ArticleRow[] {
  return [
    {
      id: DEEPLINK_ARTICLE_ID,
      url: `https://${DEEPLINK_SOURCE}/target`,
      title: "Deep-linked target article",
      source: DEEPLINK_SOURCE,
      added_at: isoMinutesAgo(3950),
      added_via: "manual",
      status: "ready",
      tags: [DEEPLINK_TAG],
      summary_json: summaryFor(
        "Deep-linked target article",
        "Статья для проверки глубокой ссылки.",
      ),
      summary_ru: "Статья для проверки глубокой ссылки.",
    },
  ];
}

export function buildSeedSql(): string {
  const rows = [
    ...paginationRows(),
    ...translateRows(),
    ...ownerVisitorRows(),
    ...searchRows(),
    ...deepLinkRows(),
  ];
  return [
    "DELETE FROM articles;",
    ...rows.map(insertStatement),
  ].join("\n");
}

if (import.meta.main) {
  console.log(buildSeedSql());
}
