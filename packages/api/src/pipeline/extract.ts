import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { extractPublishedDate } from "./publishedDate.ts";

export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  textContent: string;
  publishedAt: string | null;
}

const MAX_TEXT_CHARS = 30_000;

// linkedom/Readability cost scales with total DOM node count, not just byte
// size — pages heavy in <script>/<svg>/<template> noise (seen in practice on
// a GitHub repo page: ~330 such tags) can burn disproportionate CPU time
// relative to their actual article content. Stripping that noise on the raw
// string before parseHTML() ever builds a DOM is far cheaper than letting
// Readability score-and-discard it node by node.
//
// Task 62: `<script type="application/ld+json">` blocks are deliberately
// spared — extractPublishedDate (below) reads `datePublished` out of them,
// and they carry no visible text Readability would ever score as article
// content, so keeping them costs nothing.
const OTHER_NOISE_TAG_PATTERN = /<(style|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

function replaceUntilStable(input: string, pattern: RegExp, replacement: string): string {
  let current = input;
  while (true) {
    const next = current.replace(pattern, replacement);
    if (next === current) return next;
    current = next;
  }
}

function stripHtmlCommentsCompletely(input: string): string {
  let current = input;
  while (true) {
    const withoutComments = replaceUntilStable(current, HTML_COMMENT_PATTERN, "");
    const next = replaceUntilStable(withoutComments, OTHER_NOISE_TAG_PATTERN, "");
    if (next === current) return next;
    current = next;
  }
}

// Bounds the string handed to capBytes/parseHTML so a large non-content
// <script> blob (analytics bundles, inline JSON blobs, etc.) can't crowd real
// article content out past HTML_PARSE_CAP below. This is a size-bound
// optimization only, not a security filter — extractArticle's DOM-based
// removal (after parseHTML, see below) is the authoritative step, and nothing
// here is ever returned as HTML to a client (see CLAUDE.md). Deliberately a
// manual scan for the literal `</script` sequence rather than a single regex
// spanning open-to-close tags: CodeQL's js/bad-tag-filter flags exactly that
// pattern as unreliable, since a lazy/greedy match across an entire document
// can't reliably tell where a script block really ends. Walking the string by
// hand and searching for the literal close tag mirrors how real HTML parsers
// treat <script> as a raw-text element (content inside can't prematurely
// close it), without the backtracking-prone regex.
function stripLargeScriptContentForSizeBound(html: string): string {
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let i = 0;

  while (i < html.length) {
    const openIdx = lower.indexOf("<script", i);
    if (openIdx === -1) {
      parts.push(html.slice(i));
      break;
    }

    const boundaryChar = html[openIdx + 7];
    const isRealTag = boundaryChar === undefined || /[\s>/]/.test(boundaryChar);
    if (!isRealTag) {
      // e.g. "<scripter" — not actually a <script> tag; keep scanning.
      parts.push(html.slice(i, openIdx + 7));
      i = openIdx + 7;
      continue;
    }

    const tagCloseIdx = html.indexOf(">", openIdx);
    if (tagCloseIdx === -1) {
      // Unterminated opening tag — nothing meaningful follows.
      parts.push(html.slice(i));
      break;
    }
    parts.push(html.slice(i, openIdx));
    const openTag = html.slice(openIdx, tagCloseIdx + 1);
    const keepJsonLd = openTag.toLowerCase().includes("application/ld+json");

    const closeIdx = lower.indexOf("</script", tagCloseIdx + 1);
    if (closeIdx === -1) {
      // Unterminated script — the rest of the document is its raw-text
      // content, same as a real parser would treat it.
      if (keepJsonLd) parts.push(html.slice(openIdx));
      break;
    }
    const closeTagEndIdx = html.indexOf(">", closeIdx);
    const end = closeTagEndIdx === -1 ? html.length : closeTagEndIdx + 1;

    if (keepJsonLd) parts.push(html.slice(openIdx, end));
    i = end;
  }

  return parts.join("");
}

function stripNoise(html: string): string {
  return stripHtmlCommentsCompletely(stripLargeScriptContentForSizeBound(html));
}

// 1.5 MB — applied AFTER noise-stripping, so a legitimately large article
// isn't truncated just because it also carried a lot of stripped-out chrome.
const HTML_PARSE_CAP = 1.5 * 1024 * 1024;

function capBytes(input: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(input);
  if (bytes.length <= maxBytes) return input;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, maxBytes));
}

// Parses raw HTML server-side and returns plain text only — the caller must
// never forward the original HTML to a client.
export function extractArticle(html: string, fallbackTitle?: string): ExtractedArticle {
  const safeHtml = capBytes(stripNoise(html), HTML_PARSE_CAP);
  const { document } = parseHTML(safeHtml);

  // Remove executable/non-content scripts structurally, while preserving
  // JSON-LD metadata scripts needed by extractPublishedDate.
  for (const script of Array.from(document.querySelectorAll("script"))) {
    const type = script.getAttribute("type")?.trim().toLowerCase();
    if (type !== "application/ld+json") {
      script.remove();
    }
  }

  // Read before Readability runs — Readability.parse() mutates the DOM it's
  // given (it can strip nodes while scoring/isolating article content), so
  // any read that needs the page's original <head>/<time> markup has to
  // happen first.
  const publishedAt = extractPublishedDate(document);

  let title: string | null = null;
  let byline: string | null = null;
  let textContent = "";

  try {
    const reader = new Readability(document as unknown as Document);
    const result = reader.parse();
    if (result?.textContent) {
      title = result.title ?? null;
      byline = result.byline ?? null;
      textContent = result.textContent;
    }
  } catch {
    // Readability failed on this markup — fall back to raw body text below.
  }

  if (!textContent) {
    textContent = document.body?.textContent ?? "";
  }
  if (!title) {
    title = fallbackTitle ?? document.querySelector("title")?.textContent ?? null;
  }

  return {
    title,
    byline,
    textContent: textContent.trim().slice(0, MAX_TEXT_CHARS),
    publishedAt,
  };
}
