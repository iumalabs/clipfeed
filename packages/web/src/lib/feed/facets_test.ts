import { assertEquals } from "@std/assert";
import type { ArticleListItem } from "@clipfeed/shared/types";
import { computeSourceFacets, computeTagFacets } from "./facets.ts";

function article(overrides: Partial<ArticleListItem> & { id: string }): ArticleListItem {
  return {
    url: `https://example.com/${overrides.id}`,
    canonical_url: null,
    title: overrides.id,
    source: null,
    author: null,
    published_at: null,
    added_at: "2026-01-01T00:00:00.000Z",
    added_via: "manual",
    lang_original: null,
    summary_ru: null,
    summary_en: null,
    summary_json: null,
    tags: [],
    status: "ready",
    archived: false,
    error: null,
    fail_class: null,
    heal_attempts: 0,
    faithfulness_verdict: null,
    faithfulness_json: null,
    faithfulness_checked_at: null,
    embedded_at: null,
    telegram_published_at: null,
    en_generated_at: null,
    image_key: null,
    image_source_url: null,
    image_width: null,
    image_height: null,
    processing_started_at: null,
    faithfulness_enforced_at: null,
    ...overrides,
  };
}

// --- computeTagFacets — client-side fallback used only in the flat
// semantic-search view (see App.tsx); everywhere else GET
// /api/articles/facets is authoritative. ---

Deno.test("computeTagFacets: counts each tag across articles, sorted count desc then tag asc", () => {
  const facets = computeTagFacets([
    article({ id: "a", tags: ["ai", "news"] }),
    article({ id: "b", tags: ["ai"] }),
    article({ id: "c", tags: ["news"] }),
    article({ id: "d", tags: ["zzz"] }),
  ]);
  assertEquals(facets, [
    { tag: "ai", count: 2 },
    { tag: "news", count: 2 },
    { tag: "zzz", count: 1 },
  ]);
});

Deno.test("computeTagFacets: an empty article list yields an empty facet list", () => {
  assertEquals(computeTagFacets([]), []);
});

// --- computeSourceFacets ---

Deno.test("computeSourceFacets: counts each source across articles, sorted count desc then source asc, nulls excluded", () => {
  const facets = computeSourceFacets([
    article({ id: "a", source: "b.example" }),
    article({ id: "b", source: "a.example" }),
    article({ id: "c", source: "a.example" }),
    article({ id: "d", source: null }),
  ]);
  assertEquals(facets, [
    { source: "a.example", count: 2 },
    { source: "b.example", count: 1 },
  ]);
});

Deno.test("computeSourceFacets: an empty article list yields an empty facet list", () => {
  assertEquals(computeSourceFacets([]), []);
});
