// Task 64: catches an extraction that technically clears
// MIN_EXTRACTED_CHARS but isn't actually news — an "About us"/legal/ad-info
// page whose own boilerplate prose (privacy policy, advertising terms, "who
// we are") reads long enough to pass the length guard but only ever
// produces a hollow, low-value summary (the incident this fixes: a "TL;DR:
// content unavailable for processing" summary generated FROM a publication's
// About page). Pure regex heuristic, deliberately with NO LLM call — the
// whole point is to skip a wasted summarization call, not spend tokens
// asking the model to judge itself.
//
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
export interface ArticleClassification {
  isNonArticle: boolean;
  matchedMarkers: string[];
  reason: string | null;
}

const TITLE_PATTERNS: RegExp[] = [
  /^about(\s+(us|the\s+company|this\s+(site|publication)))?$/i,
  /^advertis(e|ing)(\s+with\s+us)?$/i,
  /^privacy\s+policy$/i,
  /^terms(\s+of\s+(use|service))?$/i,
  /^cookie\s+policy$/i,
  /^contact(\s+us)?$/i,
  /^media\s+kit$/i,
];

const BODY_MARKERS: { key: string; pattern: RegExp }[] = [
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
];

// A page whose own "article" content is dominated by boilerplate like this
// won't heal on retry — it's not a real news article now and won't become
// one — so this belongs in PERMANENT_RULES right next to insufficient_text,
// not a healable class. See classify-failure.ts's "not_news" rule.
const MIN_DISTINCT_MARKERS = 3;

export function classifyArticleContent(
  extracted: { title: string | null; textContent: string },
): ArticleClassification {
  const title = (extracted.title ?? "").trim();
  for (const pattern of TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return {
        isNonArticle: true,
        matchedMarkers: [],
        reason: `title matches a non-article page pattern ("${title}")`,
      };
    }
  }

  const matchedMarkers = BODY_MARKERS
    .filter((marker) => marker.pattern.test(extracted.textContent))
    .map((marker) => marker.key);

  if (matchedMarkers.length >= MIN_DISTINCT_MARKERS) {
    return {
      isNonArticle: true,
      matchedMarkers,
      reason: `boilerplate markers: ${matchedMarkers.join(", ")}`,
    };
  }

  return { isNonArticle: false, matchedMarkers, reason: null };
}
