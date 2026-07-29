// Task 50 Part C: compile-time-checked field lists for the wire shapes the
// SPA depends on. Each `KEYS` array below is checked against its type by
// `keysOf` — if a field is ever added to, removed from, or renamed in the
// source interface (packages/shared/src/types.ts) without this array being
// updated to match EXACTLY (not a superset, not a subset), `deno check`
// fails to compile. That's what "derived from the shared types, not a
// hand-list that can drift" means in practice: this is still a literal
// array (TypeScript has no runtime reflection over `interface`/`type`), but
// it cannot silently go stale the way a plain hand-maintained list could —
// the LIST_COLUMNS drift this exists to catch (Tasks 34/40/49) was exactly a
// hand list quietly falling out of sync with its type for months.
//
// packages/api/src/articles/db_test.ts's LIST_COLUMNS-vs-ArticleRow check is
// the sibling guarantee on the SERVER side (the SQL SELECT column list
// matches the row mapper); this file is the CLIENT-facing half — what the
// wire response for each shape must actually contain.
import type { ArticleListItem, PublicArticle, SearchResultItem, SummaryJson } from "./types.ts";

function keysOf<T>() {
  return function fromKeys<K extends readonly (keyof T)[]>(
    keys: [keyof T] extends [K[number]] ? K : never,
  ): K {
    return keys;
  };
}

// GET /api/admin/articles / /api/admin/articles/:id (owner) — the full,
// unredacted list-item shape (everything but full_text, which only the
// single-article admin endpoint additionally carries).
export const ARTICLE_LIST_ITEM_KEYS = keysOf<ArticleListItem>()(
  [
    "id",
    "url",
    "canonical_url",
    "title",
    "source",
    "author",
    "published_at",
    "added_at",
    "added_via",
    "lang_original",
    "summary_ru",
    "summary_en",
    "summary_json",
    "tags",
    "status",
    "archived",
    "error",
    "fail_class",
    "heal_attempts",
    "faithfulness_verdict",
    "faithfulness_json",
    "faithfulness_checked_at",
    "embedded_at",
    "telegram_published_at",
    "en_generated_at",
    "image_key",
    "image_source_url",
    "image_width",
    "image_height",
    "processing_started_at",
    "faithfulness_enforced_at",
  ] as const,
);

// GET /api/articles / /api/articles/:id / /api/search (public) — the
// redacted shape: full_text/error/faithfulness_json/faithfulness_verdict/
// faithfulness_enforced_at dropped, has_error added (see
// toPublicListItem/toPublicArticle in packages/api/src/articles/db.ts).
export const PUBLIC_ARTICLE_KEYS = keysOf<PublicArticle>()(
  [
    "id",
    "url",
    "canonical_url",
    "title",
    "source",
    "author",
    "published_at",
    "added_at",
    "added_via",
    "lang_original",
    "summary_ru",
    "summary_en",
    "summary_json",
    "tags",
    "status",
    "archived",
    "fail_class",
    "heal_attempts",
    "faithfulness_checked_at",
    "embedded_at",
    "telegram_published_at",
    "en_generated_at",
    "image_key",
    "image_source_url",
    "image_width",
    "image_height",
    "processing_started_at",
    "has_error",
  ] as const,
);

// A parsed `summary_json` column — every field the SPA's selectSummaryFields
// (packages/web/src/lib/content/summaryFields.ts) reads, whether required or
// (lazily-populated) optional.
export const SUMMARY_JSON_KEYS = keysOf<SummaryJson>()(
  [
    "title_ru",
    "title_en",
    "tldr_ru",
    "tldr_en",
    "body_ru",
    "body_en",
    "bullets_ru",
    "bullets_en",
    "tags",
    "lang_original",
  ] as const,
);

// GET /api/search (public, semantic mode) — one hit.
export const SEARCH_RESULT_ITEM_KEYS = keysOf<SearchResultItem>()(["article", "score"] as const);
