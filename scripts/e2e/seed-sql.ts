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
// packages/web/src/lib/feed/dateGrouping.ts) is exercised with a value both sides
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

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();
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
  archived?: boolean;
  published_at?: string | null;
  faithfulness_verdict?: string | null;
  faithfulness_json?: Record<string, unknown> | null;
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
    "published_at",
    "faithfulness_verdict",
    "faithfulness_json",
  ];
  const values = [
    sqlString(row.id),
    sqlString(row.url),
    sqlString(row.title),
    sqlString(row.source),
    sqlString(row.added_at),
    sqlString(row.added_via),
    sqlString(row.status),
    row.archived ? "1" : "0",
    sqlJson(row.tags),
    row.summary_ru ? sqlString(row.summary_ru) : "NULL",
    summaryJson ? sqlJson(summaryJson) : "NULL",
    row.error !== undefined && row.error !== null ? sqlString(row.error) : "NULL",
    row.fail_class ? sqlString(row.fail_class) : "NULL",
    row.en_generated_at ? sqlString(row.en_generated_at) : "NULL",
    row.published_at ? sqlString(row.published_at) : "NULL",
    row.faithfulness_verdict ? sqlString(row.faithfulness_verdict) : "NULL",
    row.faithfulness_json ? sqlJson(row.faithfulness_json) : "NULL",
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

// --- Group 6: duplicate-add reveal (Task 55) ---
// Three rows, one per reveal state the SPA's handleAdd must distinguish on
// a duplicate 409: ready (not archived), archived, and failed — each its
// own URL so a real POST /api/admin/articles re-add of that exact URL is
// the trigger, same as a live duplicate hit.
const DUPADD_SOURCE = "e2e-dupadd.example.com";
const DUPADD_TAG = "e2e-dupadd";
export const DUPADD_READY_URL = `https://${DUPADD_SOURCE}/ready`;
export const DUPADD_ARCHIVED_URL = `https://${DUPADD_SOURCE}/archived`;
export const DUPADD_FAILED_URL = `https://${DUPADD_SOURCE}/failed`;
export const DUPADD_READY_ID = "e2e-dupadd-ready";
export const DUPADD_ARCHIVED_ID = "e2e-dupadd-archived";
export const DUPADD_FAILED_ID = "e2e-dupadd-failed";

function duplicateAddRows(): ArticleRow[] {
  return [
    {
      id: DUPADD_READY_ID,
      url: DUPADD_READY_URL,
      title: "Duplicate-add ready article",
      source: DUPADD_SOURCE,
      added_at: isoMinutesAgo(3960),
      added_via: "manual",
      status: "ready",
      tags: [DUPADD_TAG],
      summary_json: summaryFor("Duplicate-add ready article", "Готовая статья для теста дублей."),
      summary_ru: "Готовая статья для теста дублей.",
    },
    {
      id: DUPADD_ARCHIVED_ID,
      url: DUPADD_ARCHIVED_URL,
      title: "Duplicate-add archived article",
      source: DUPADD_SOURCE,
      added_at: isoMinutesAgo(3965),
      added_via: "manual",
      status: "ready",
      tags: [DUPADD_TAG],
      summary_json: summaryFor(
        "Duplicate-add archived article",
        "Архивная статья для теста дублей.",
      ),
      summary_ru: "Архивная статья для теста дублей.",
      archived: true,
    },
    {
      id: DUPADD_FAILED_ID,
      url: DUPADD_FAILED_URL,
      title: "Duplicate-add failed article",
      source: DUPADD_SOURCE,
      added_at: isoMinutesAgo(3970),
      added_via: "manual",
      status: "failed",
      tags: [DUPADD_TAG],
      error: "internal: extract: fetch failed with status 500",
      fail_class: "transient",
    },
  ];
}

// --- Group 7: section grouping vs. card date (Task 61) ---
// The owner's exact bug report: an article added TODAY but published
// several days ago must render under "Today" (sections bucket by
// added_at), while its card still shows the OLD published date (the
// card label reads published_at, falling back to added_at only when
// published_at is missing/unparseable — see lib/format/format.ts's
// resolveCardDateIso).
const SECTION_GROUPING_SOURCE = "e2e-sectiongrouping.example.com";
const SECTION_GROUPING_TAG = "e2e-sectiongrouping";
export const SECTION_GROUPING_ARTICLE_ID = "e2e-sectiongrouping-old-published";
export const SECTION_GROUPING_PUBLISHED_AT = isoDaysAgo(4);

function sectionGroupingRows(): ArticleRow[] {
  return [
    {
      id: SECTION_GROUPING_ARTICLE_ID,
      url: `https://${SECTION_GROUPING_SOURCE}/old-published`,
      title: "Old article added today",
      source: SECTION_GROUPING_SOURCE,
      // 2 min ago — deliberately not a multiple of 5 so it never ties with
      // any pagination-group row (those sit at 5, 10, 15, ... min ago).
      added_at: isoMinutesAgo(2),
      published_at: SECTION_GROUPING_PUBLISHED_AT,
      added_via: "manual",
      status: "ready",
      tags: [SECTION_GROUPING_TAG],
      summary_json: summaryFor(
        "Old article added today",
        "Старая статья, добавленная сегодня.",
      ),
      summary_ru: "Старая статья, добавленная сегодня.",
    },
  ];
}

// --- Group 8: tag/source facet counts (Task 62 regression) ---
// The bug this replaces: the sidebar's tag/source pill counts used to be
// computed CLIENT-SIDE over whatever articles happened to already be loaded
// (Today+Yesterday by default), so an unfiltered view showed something
// closer to "today's tag counts" than a true all-time total — see
// GET /api/articles/facets in packages/api/src/articles/db.ts. 2 rows sit in
// "today" (always loaded by the initial-load loop) and 5 sit well into
// "earlier" (never loaded until that section is expanded) — a correct facet
// count must show all 7 without the reader ever expanding "earlier".
const FACETS_SOURCE = "e2e-facets.example.com";
export const FACETS_TAG = "e2e-facets";
export const FACETS_TOTAL_COUNT = 7;

function facetsRows(): ArticleRow[] {
  const rows: ArticleRow[] = [];
  for (let i = 0; i < 2; i++) {
    rows.push({
      id: `e2e-facets-today-${i}`,
      url: `https://${FACETS_SOURCE}/today/${i}`,
      title: `Facets today #${i}`,
      source: FACETS_SOURCE,
      added_at: isoMinutesAgo(3 + i),
      added_via: "manual",
      status: "ready",
      tags: [FACETS_TAG],
      summary_json: summaryFor(`Facets today #${i}`, "Сегодняшняя статья для теста фасетов."),
      summary_ru: "Сегодняшняя статья для теста фасетов.",
    });
  }
  for (let i = 0; i < 5; i++) {
    rows.push({
      id: `e2e-facets-earlier-${i}`,
      url: `https://${FACETS_SOURCE}/earlier/${i}`,
      title: `Facets earlier #${i}`,
      source: FACETS_SOURCE,
      added_at: isoMinutesAgo(5000 + 10 * i),
      added_via: "manual",
      status: "ready",
      tags: [FACETS_TAG],
      summary_json: summaryFor(`Facets earlier #${i}`, "Более старая статья для теста фасетов."),
      summary_ru: "Более старая статья для теста фасетов.",
    });
  }
  return rows;
}

// --- Group 9: owner mutations — archive/unarchive + delete ---
// Deliberately does NOT exercise retry/resummarize/create-new-article: those
// enqueue a REAL pipeline run (fetch -> extract -> summarize) against
// whatever URL is on the row, which for a fake "e2e-*.example.com" domain
// means a real, slow, doomed-to-fail network call — exactly what this whole
// harness is built to avoid (see scripts/e2e/run.ts's doc comment: zero
// external network dependency, zero real cost). Archive and delete are pure
// D1 mutations with no queue/pipeline involvement at all, so they're safe to
// exercise against the real running worker.
const OWNERACTIONS_SOURCE = "e2e-owneractions.example.com";
export const OWNERACTIONS_TAG = "e2e-owneractions";
export const OWNERACTIONS_ARCHIVE_ID = "e2e-owneractions-archive";
export const OWNERACTIONS_DELETE_ID = "e2e-owneractions-delete";

function ownerActionsRows(): ArticleRow[] {
  return [
    {
      id: OWNERACTIONS_ARCHIVE_ID,
      url: `https://${OWNERACTIONS_SOURCE}/archive`,
      title: "Owner-actions archive target",
      source: OWNERACTIONS_SOURCE,
      added_at: isoMinutesAgo(5100),
      added_via: "manual",
      status: "ready",
      tags: [OWNERACTIONS_TAG],
      summary_json: summaryFor(
        "Owner-actions archive target",
        "Статья для теста архивации владельцем.",
      ),
      summary_ru: "Статья для теста архивации владельцем.",
    },
    {
      id: OWNERACTIONS_DELETE_ID,
      url: `https://${OWNERACTIONS_SOURCE}/delete`,
      title: "Owner-actions delete target",
      source: OWNERACTIONS_SOURCE,
      added_at: isoMinutesAgo(5110),
      added_via: "manual",
      status: "ready",
      tags: [OWNERACTIONS_TAG],
      summary_json: summaryFor(
        "Owner-actions delete target",
        "Статья для теста удаления владельцем.",
      ),
      summary_ru: "Статья для теста удаления владельцем.",
    },
  ];
}

// --- Group 10: faithfulness actionable detail (Task 61 follow-up
// regression) — an owner-only 'weak'/'fail' badge must resolve its flagged
// claims back to the actual summary sentence, not just a bare count. Claim
// indices follow buildFaithfulnessClaimTexts' fixed ordering (1=tldr,
// 2..=bullets in order, then body paragraphs) — summaryFor() always
// produces exactly 2 bullets_ru + 1 body_ru paragraph, so claim 2 here is
// the fixture's first bullet, deliberately flagged 'unsupported'.
const FAITHFULNESS_SOURCE = "e2e-faithfulness.example.com";
export const FAITHFULNESS_TAG = "e2e-faithfulness";
export const FAITHFULNESS_ARTICLE_ID = "e2e-faithfulness-weak";
export const FAITHFULNESS_FLAGGED_BULLET = "Пункт первый.";

function faithfulnessRows(): ArticleRow[] {
  return [
    {
      id: FAITHFULNESS_ARTICLE_ID,
      url: `https://${FAITHFULNESS_SOURCE}/weak`,
      title: "Faithfulness weak-verdict article",
      source: FAITHFULNESS_SOURCE,
      added_at: isoMinutesAgo(5200),
      added_via: "manual",
      status: "ready",
      tags: [FAITHFULNESS_TAG],
      summary_json: summaryFor(
        "Faithfulness weak-verdict article",
        "Статья для теста достоверности.",
      ),
      summary_ru: "Статья для теста достоверности.",
      faithfulness_verdict: "weak",
      faithfulness_json: {
        claims: [
          { i: 1, verdict: "supported", evidence: "" },
          { i: 2, verdict: "unsupported", evidence: "Источник этого не подтверждает." },
          { i: 3, verdict: "supported", evidence: "" },
          { i: 4, verdict: "supported", evidence: "" },
        ],
      },
    },
  ];
}

// --- Group 11: agent-batch indicator (owner-only aggregate progress UI) ---
// Three 'agent' added_via rows, all pending and within WAVE_TOLERANCE_MS of
// each other (see lib/feed/agentBatch.ts) so they're seen as one wave. Pinned
// well into "earlier" like every other non-pagination group — the indicator
// itself is section-agnostic (Feed.tsx computes it per-section over
// whichever items landed there), so it renders under the Earlier section's
// own header exactly like it would under Today in production. Each row's
// eventual "ready" flip is driven by e2e/fixtures/db.ts's runSql mid-test
// (same technique as pagination.spec.ts's poll-merge card), never a real
// pipeline run.
const AGENTBATCH_SOURCE = "e2e-agentbatch.example.com";
export const AGENTBATCH_TAG = "e2e-agentbatch";
export const AGENTBATCH_IDS = ["e2e-agentbatch-0", "e2e-agentbatch-1", "e2e-agentbatch-2"];

function agentBatchRows(): ArticleRow[] {
  return AGENTBATCH_IDS.map((id, i) => ({
    id,
    url: `https://${AGENTBATCH_SOURCE}/${i}`,
    title: `Agent batch #${i}`,
    source: AGENTBATCH_SOURCE,
    added_at: isoMinutesAgo(5300 + i),
    added_via: "agent",
    status: "pending" as const,
    tags: [AGENTBATCH_TAG],
  }));
}

export function buildSeedSql(): string {
  const rows = [
    ...paginationRows(),
    ...translateRows(),
    ...ownerVisitorRows(),
    ...searchRows(),
    ...deepLinkRows(),
    ...duplicateAddRows(),
    ...sectionGroupingRows(),
    ...facetsRows(),
    ...ownerActionsRows(),
    ...faithfulnessRows(),
    ...agentBatchRows(),
  ];
  return [
    "DELETE FROM articles;",
    ...rows.map(insertStatement),
  ].join("\n");
}

if (import.meta.main) {
  console.log(buildSeedSql());
}
