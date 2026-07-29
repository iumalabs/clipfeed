import { assertEquals } from "@std/assert";
import { parseHTML } from "linkedom";
import { extractPublishedDate, normalizePublishedAt } from "./publishedDate.ts";

const NOW = new Date("2026-07-29T12:00:00.000Z");

// --- normalizePublishedAt: sanity gate ---

Deno.test("normalizePublishedAt: a valid ISO date normalizes as-is", () => {
  assertEquals(normalizePublishedAt("2026-07-10T08:00:00.000Z", NOW), "2026-07-10T08:00:00.000Z");
});

Deno.test("normalizePublishedAt: a valid non-ISO date string normalizes to ISO", () => {
  assertEquals(normalizePublishedAt("July 10, 2026", NOW), new Date("July 10, 2026").toISOString());
});

Deno.test("normalizePublishedAt: null/undefined/empty/whitespace all return null", () => {
  assertEquals(normalizePublishedAt(null, NOW), null);
  assertEquals(normalizePublishedAt(undefined, NOW), null);
  assertEquals(normalizePublishedAt("", NOW), null);
  assertEquals(normalizePublishedAt("   ", NOW), null);
});

Deno.test("normalizePublishedAt: unparseable garbage returns null", () => {
  assertEquals(normalizePublishedAt("not a date", NOW), null);
  assertEquals(normalizePublishedAt("{{cms_date_placeholder}}", NOW), null);
});

Deno.test("normalizePublishedAt: more than 1 day in the future is rejected", () => {
  assertEquals(normalizePublishedAt("2026-07-31T00:00:00.000Z", NOW), null);
});

Deno.test("normalizePublishedAt: exactly at the 1-day future skew boundary is accepted", () => {
  const boundary = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
  assertEquals(normalizePublishedAt(boundary, NOW), boundary);
});

Deno.test("normalizePublishedAt: a few hours in the future (clock skew) is accepted", () => {
  const soon = new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString();
  assertEquals(normalizePublishedAt(soon, NOW), soon);
});

Deno.test("normalizePublishedAt: before 1990 is rejected", () => {
  assertEquals(normalizePublishedAt("1989-12-31T00:00:00.000Z", NOW), null);
});

Deno.test("normalizePublishedAt: exactly 1990 is accepted", () => {
  assertEquals(normalizePublishedAt("1990-01-01T00:00:00.000Z", NOW), "1990-01-01T00:00:00.000Z");
});

// --- extractPublishedDate: strategy chain against real linkedom documents ---

function doc(html: string) {
  return parseHTML(`<html><head></head><body>${html}</body></html>`).document;
}

Deno.test("extractPublishedDate: JSON-LD datePublished wins", () => {
  const html = `
    <script type="application/ld+json">{"@type":"Article","datePublished":"2026-07-10T08:00:00.000Z"}</script>
    <meta property="article:published_time" content="2026-07-11T08:00:00.000Z">
  `;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-10T08:00:00.000Z");
});

Deno.test("extractPublishedDate: JSON-LD nested under @graph is found", () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"WebSite"},{"@type":"Article","datePublished":"2026-07-10T08:00:00.000Z"}]}
  </script>`;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-10T08:00:00.000Z");
});

Deno.test("extractPublishedDate: JSON-LD as a top-level array is found", () => {
  const html = `<script type="application/ld+json">
    [{"@type":"BreadcrumbList"},{"@type":"Article","datePublished":"2026-07-10T08:00:00.000Z"}]
  </script>`;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-10T08:00:00.000Z");
});

Deno.test("extractPublishedDate: malformed JSON-LD is skipped, falls through to meta", () => {
  const html = `
    <script type="application/ld+json">{ this is not json </script>
    <meta property="article:published_time" content="2026-07-11T08:00:00.000Z">
  `;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-11T08:00:00.000Z");
});

Deno.test("extractPublishedDate: meta property=article:published_time is used when no JSON-LD", () => {
  const html = `<meta property="article:published_time" content="2026-07-11T08:00:00.000Z">`;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-11T08:00:00.000Z");
});

Deno.test("extractPublishedDate: meta name=date is used when neither JSON-LD nor article:published_time exist", () => {
  const html = `<meta name="date" content="2026-07-12">`;
  assertEquals(extractPublishedDate(doc(html), NOW), new Date("2026-07-12").toISOString());
});

Deno.test("extractPublishedDate: <time datetime> inside <article> is used as a last resort", () => {
  const html =
    `<article><time datetime="2026-07-13T00:00:00.000Z">July 13</time></article><time datetime="2026-07-14T00:00:00.000Z">unrelated</time>`;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-13T00:00:00.000Z");
});

Deno.test("extractPublishedDate: falls back to any <time datetime> when none is inside <article>", () => {
  const html = `<div><time datetime="2026-07-14T00:00:00.000Z">July 14</time></div>`;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-14T00:00:00.000Z");
});

Deno.test("extractPublishedDate: a bogus first-strategy value falls through to the next valid one", () => {
  // JSON-LD present but its date is nonsense — must not win just by being first.
  const html = `
    <script type="application/ld+json">{"@type":"Article","datePublished":"not-a-date"}</script>
    <meta property="article:published_time" content="2026-07-11T08:00:00.000Z">
  `;
  assertEquals(extractPublishedDate(doc(html), NOW), "2026-07-11T08:00:00.000Z");
});

Deno.test("extractPublishedDate: nothing found anywhere returns null", () => {
  const html = `<article><p>No date metadata on this page at all.</p></article>`;
  assertEquals(extractPublishedDate(doc(html), NOW), null);
});
