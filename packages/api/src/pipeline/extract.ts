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
const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>[\s\S]*?<\/script\b[^>]*>/gi;
const JSON_LD_TYPE_PATTERN = /type\s*=\s*["']application\/ld\+json["']/i;
const OTHER_NOISE_TAG_PATTERN = /<(style|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

function stripHtmlCommentsCompletely(input: string): string {
  let current = html;
  while (true) {
    const withoutComments = current.replace(HTML_COMMENT_PATTERN, "");
    const withoutNoiseScripts = withoutComments.replace(
      SCRIPT_TAG_PATTERN,
      (match, attrs) => JSON_LD_TYPE_PATTERN.test(attrs) ? match : "",
    );
    const next = withoutNoiseScripts.replace(OTHER_NOISE_TAG_PATTERN, "");
    if (next === current) return next;
    current = next;
  }
}

function stripNoise(html: string): string {
  const withoutComments = stripHtmlCommentsCompletely(html);
  const withoutNoiseScripts = withoutComments.replace(
    SCRIPT_TAG_PATTERN,
    (match, attrs) => JSON_LD_TYPE_PATTERN.test(attrs) ? match : "",
  );
  return withoutNoiseScripts.replace(OTHER_NOISE_TAG_PATTERN, "");
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
