import type { Lang } from "../../i18n/i18n.ts";

export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  const locale = lang === "ru" ? "ru-RU" : "en-US";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

// Task 61: the card shows the source's original publication date, not when
// the article entered this feed, so a reader can judge how fresh the
// underlying material is. Falls back to added_at when published_at is
// missing (null — many sources never return one) or unparseable (a
// malformed date string is exactly as useless to a reader as no date at
// all). added_at is never null, so this always resolves to something
// formattable.
export function resolveCardDateIso(publishedAt: string | null, addedAt: string): string {
  if (publishedAt !== null && !Number.isNaN(new Date(publishedAt).getTime())) return publishedAt;
  return addedAt;
}

// Task 35 Part C §4: the expanded card's image caption names the source
// domain the og:image was fetched from (image_source_url) — same
// lowercase/no-www normalization as the API's url-host.ts, kept as a
// separate copy since the web package doesn't share a bundle with the API.
export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
