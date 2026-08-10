// Task 64: catches an extraction that technically clears
// MIN_EXTRACTED_CHARS but isn't actually news — an "About us"/legal/ad-info
// page whose own boilerplate prose (privacy policy, advertising terms, "who
// we are") reads long enough to pass the length guard but only ever
// produces a hollow, low-value summary (the incident this fixes: a "TL;DR:
// content unavailable for processing" summary generated FROM a publication's
// About page). Pure regex heuristics, deliberately with NO LLM call — the
// whole point is to skip a wasted summarization call, not spend tokens
// asking the model to judge itself.
//
// Task 67: generalized from a single hardcoded check into a small registry
// of CONTENT_FILTERS (see below) after the first non-boilerplate case showed
// up in the wild — a sponsored product-deal roundup ("39% off, buy now")
// that reads as real prose (so the boilerplate marker count never trips)
// but still isn't the kind of news article this feed exists to summarize.
// Adding a THIRD kind of non-article page (a paywalled-teaser page, a
// listicle-of-links page, whatever shows up next) is meant to be a single
// new entry in CONTENT_FILTERS below, not a change to classifyArticleContent
// itself, pipeline.ts's call site, or classify-failure.ts — every filter's
// hit is wrapped in the SAME "extraction: not a news article (...)" prefix
// (see pipeline.ts), which classify-failure.ts already maps to the single
// "not_news" PermanentReasonKey, and the SPA's existing not_news copy
// already reads "the page doesn't look like news (about/ads/legal page)" —
// written broadly enough up front to cover exactly this kind of addition.
export interface ArticleClassification {
  isNonArticle: boolean;
  matchedMarkers: string[];
  reason: string | null;
  // Which entry in CONTENT_FILTERS tripped (its `key`), or null when
  // nothing matched. Purely observational — folded into `reason` for logs,
  // but nothing downstream branches on it, so adding a filter never needs a
  // matching change here.
  filterKey: string | null;
}

interface ContentFilter {
  key: string;
  // Whole-title match only (never a substring of a real headline) — see
  // the false-positive discussion on BOILERPLATE_FILTER below.
  titlePatterns?: RegExp[];
  bodyMarkers?: { key: string; pattern: RegExp }[];
  // How many DISTINCT bodyMarkers categories must hit before this filter
  // flags the page. Required whenever bodyMarkers is set — no implicit
  // default, since the right threshold is a per-filter judgment call (see
  // each filter's own comment for its reasoning).
  minDistinctMarkers?: number;
}

// Real news pages routinely link to a site-wide "Privacy Policy"/"Contact
// Us" footer too, but Readability (see extract.ts) strips nav/footer chrome
// before returning textContent — so a SINGLE boilerplate marker surviving
// into the extracted text is unremarkable. What's NOT normal is several of
// them showing up together as actual prose, which only happens when the
// "article" Readability isolated IS the boilerplate page itself. Requiring
// several distinct categories (not just several regex hits — a page could
// repeat "privacy policy" many times and still only be about one thing)
// keeps this conservative against false-positiving a real article that
// happens to mention one of these concepts in passing.
const BOILERPLATE_FILTER: ContentFilter = {
  key: "boilerplate",
  titlePatterns: [
    /^about(\s+(us|the\s+company|this\s+(site|publication)))?$/i,
    /^advertis(e|ing)(\s+with\s+us)?$/i,
    /^privacy\s+policy$/i,
    /^terms(\s+of\s+(use|service))?$/i,
    /^cookie\s+policy$/i,
    /^contact(\s+us)?$/i,
    /^media\s+kit$/i,
  ],
  bodyMarkers: [
    { key: "privacy_policy", pattern: /privacy policy/i },
    { key: "terms", pattern: /terms of (use|service)/i },
    { key: "advertise", pattern: /advertis(e|ing) (with us|opportunities)|our advertising/i },
    { key: "cookie_policy", pattern: /cookie policy/i },
    { key: "newsletter_subscribe", pattern: /subscribe to (our|the) newsletter/i },
    { key: "contact_us", pattern: /\bcontact us\b/i },
    { key: "rights_reserved", pattern: /all rights reserved/i },
    { key: "editorial_team", pattern: /editorial (team|staff|guidelines)/i },
    {
      key: "media_positioning",
      pattern: /\b(is|was) an? independent (media|publication|outlet)\b|positions? itself as/i,
    },
    { key: "about_page", pattern: /about (us|the company|this (site|publication))/i },
  ],
  minDistinctMarkers: 3,
};

// Task 67: a sponsored/affiliate product-deal roundup ("39% off, was $49.99,
// now $30.39 — Buy Now") — real, well-formed prose (unlike the boilerplate
// case above), so it never trips BOILERPLATE_FILTER, but it's a promotional
// post, not news reporting, and produces the same kind of low-value summary
// (a TL;DR that just restates a discount percentage). No title pattern —
// deal-post titles are too varied to whitelist by shape, unlike boilerplate
// pages' small set of predictable titles — so this is body-markers only.
// Bilingual since sources.json aggregates non-English feeds too. 2 distinct
// categories (not 1) stays conservative against a genuine news article that
// mentions a single price change in passing (e.g. "Apple cut the iPhone's
// price by 20%") — real deal-roundup templates reliably hit at least two of
// these independently (a discount figure AND a call-to-action, or a promo
// code, or an affiliate disclosure), so requiring 2 is deliberately looser
// than BOILERPLATE_FILTER's 3 without being trigger-happy on ordinary
// pricing news.
const ADVERTISEMENT_FILTER: ContentFilter = {
  key: "advertisement",
  bodyMarkers: [
    {
      key: "discount_percent",
      pattern: /\d{1,3}\s?%\s*(off|discount)|скидк\w*\s*\d{1,3}\s?%|\d{1,3}\s?%\s*скидк/i,
    },
    { key: "promo_code", pattern: /(promo|coupon|discount)\s*code|промо\s?код/i },
    {
      key: "price_was_now",
      pattern: /\$\s?\d[\d,.]*\s*(instead of|vs\.?|was|down from)\s*\$\s?\d|вместо\s*\$?\s?\d/i,
    },
    {
      key: "buy_now_cta",
      pattern:
        /\b(buy now|shop now|see (the )?deal|grab (this|the) deal)\b|активировать промокод|купить (сейчас|со скидкой)/i,
    },
    { key: "deal_brand", pattern: /\btech deals?\b|deal of the day|today'?s (best )?deals?/i },
    {
      key: "affiliate_disclosure",
      pattern:
        /we may earn (a )?commission|affiliate link|as an amazon associate|партнёрск\w* ссылк\w*/i,
    },
  ],
  minDistinctMarkers: 2,
};

// Task 67: to add a new non-article kind, append one more entry here — no
// other file needs to change (see the module doc comment above for why).
const CONTENT_FILTERS: ContentFilter[] = [BOILERPLATE_FILTER, ADVERTISEMENT_FILTER];

export function classifyArticleContent(
  extracted: { title: string | null; textContent: string },
): ArticleClassification {
  const title = (extracted.title ?? "").trim();
  // Diagnostic-only: the first filter's own below-threshold marker hits,
  // surfaced even when nothing actually flags the page — lets a caller (or
  // a test) see how close a real article came to a false positive, same as
  // the original single-filter version did. Whichever filter hits first
  // wins; with each filter's marker vocabulary disjoint by design, two
  // filters both partially matching the same page is not expected.
  let partialMatch: string[] = [];

  for (const filter of CONTENT_FILTERS) {
    const titleMatch = filter.titlePatterns?.some((pattern) => pattern.test(title));
    if (titleMatch) {
      return {
        isNonArticle: true,
        matchedMarkers: [],
        reason: `${filter.key}: title matches a non-article page pattern ("${title}")`,
        filterKey: filter.key,
      };
    }

    if (filter.bodyMarkers) {
      const matchedMarkers = filter.bodyMarkers
        .filter((marker) => marker.pattern.test(extracted.textContent))
        .map((marker) => marker.key);

      if (matchedMarkers.length >= (filter.minDistinctMarkers ?? Infinity)) {
        return {
          isNonArticle: true,
          matchedMarkers,
          reason: `${filter.key} markers: ${matchedMarkers.join(", ")}`,
          filterKey: filter.key,
        };
      }
      if (matchedMarkers.length > 0 && partialMatch.length === 0) {
        partialMatch = matchedMarkers;
      }
    }
  }

  return { isNonArticle: false, matchedMarkers: partialMatch, reason: null, filterKey: null };
}
