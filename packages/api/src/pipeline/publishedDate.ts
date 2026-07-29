// Task 62: resolves the source's ORIGINAL publication date, distinct from
// `added_at` (when the article entered this feed — see dateGrouping.ts on
// the web side). Two producers feed the same normalizePublishedAt sanity
// gate below: the agent's RSS candidates (agent.ts, carrying a feed-reported
// date) and the extraction stage's own page-metadata scrape (pipeline.ts,
// extract.ts) for every add path, including a second look at agent articles
// — a page's own dateline is more authoritative than an RSS feed's (and, for
// Hacker News specifically, an HN candidate's `publishedAt` is when the
// story was POSTED TO HN, not when the linked article itself was published
// — see hackernews.ts), so callers should prefer this module's page-metadata
// result over the RSS-derived one when both exist.

const MIN_YEAR = 1990;
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

// Rejects anything that isn't parseable, or is far enough outside a
// plausible range to be more likely a parsing artifact than a real
// publication date (a template placeholder, a copyright-notice year, clock
// skew) than actual data worth showing a reader. Storing NULL for a
// rejected value is deliberate — a wrong date is worse than the existing
// added_at fallback (see resolveCardDateIso on the web side), which is
// always at least true.
export function normalizePublishedAt(
  raw: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) {
    console.warn(
      JSON.stringify({ event: "published_at_rejected", reason: "unparseable", raw: trimmed }),
    );
    return null;
  }
  if (ms > now.getTime() + FUTURE_SKEW_MS) {
    console.warn(
      JSON.stringify({ event: "published_at_rejected", reason: "future", raw: trimmed }),
    );
    return null;
  }
  if (parsed.getUTCFullYear() < MIN_YEAR) {
    console.warn(
      JSON.stringify({ event: "published_at_rejected", reason: "too_old", raw: trimmed }),
    );
    return null;
  }
  return parsed.toISOString();
}

// linkedom's Document type isn't exported directly; this matches the small
// surface extract.ts already relies on (querySelector/querySelectorAll)
// without pulling in a DOM lib dependency here.
interface MinimalDocument {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
  querySelectorAll(
    selector: string,
  ): ArrayLike<{ textContent: string | null }>;
}

// A page can carry several JSON-LD blocks (site-wide Organization/WebSite
// schema alongside the actual Article one) and some sites nest the real
// entry inside a top-level `@graph` array — checked across every block
// found, first `datePublished` string wins. A single malformed block (bad
// JSON) is skipped, not fatal to the others.
function extractJsonLdDate(document: MinimalDocument): string | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      const graph = node && typeof node === "object" && "@graph" in node
        ? (node as { "@graph": unknown })["@graph"]
        : node;
      const entries = Array.isArray(graph) ? graph : [graph];
      for (const entry of entries) {
        if (
          entry && typeof entry === "object" && "datePublished" in entry &&
          typeof (entry as { datePublished: unknown }).datePublished === "string"
        ) {
          return (entry as { datePublished: string }).datePublished;
        }
      }
    }
  }
  return null;
}

// Tries, in order, JSON-LD `datePublished`, `<meta property="article:published_time">`,
// `<meta name="date">`, then the first `<time datetime>` (preferring one
// inside an `<article>` region, since a page can carry unrelated `<time>`
// elements in navigation/related-posts widgets). The first candidate that
// also survives normalizePublishedAt's sanity check wins — a syntactically
// present but bogus value (e.g. a CMS placeholder) falls through to the
// next strategy rather than winning just by being first.
export function extractPublishedDate(
  document: MinimalDocument,
  now: Date = new Date(),
): string | null {
  const candidates = [
    extractJsonLdDate(document),
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
      null,
    document.querySelector('meta[name="date"]')?.getAttribute("content") ?? null,
    document.querySelector("article time[datetime]")?.getAttribute("datetime") ??
      document.querySelector("time[datetime]")?.getAttribute("datetime") ?? null,
  ];
  for (const raw of candidates) {
    const normalized = normalizePublishedAt(raw, now);
    if (normalized) return normalized;
  }
  return null;
}
