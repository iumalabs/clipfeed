// Client-side fallback for the flat semantic-search view (see App.tsx: the
// server-driven GET /api/articles/facets is skipped there, same reasoning as
// the counts effect — a global SQL-filtered facet count is meaningless when
// the visible articles are Vectorize similarity results, not SQL-filtered
// rows). Everywhere else, the server endpoint is authoritative: computing
// these over `articles` alone only reflects whatever page(s) happen to be
// loaded (Today+Yesterday by default), which is what produced the original
// "looks like today's count" bug this endpoint replaced.
import type { ArticleListItem } from "@clipfeed/shared/types";
import type { SourceFacet, TagFacet } from "../../components/Sidebar.tsx";

export function computeTagFacets(articles: ArticleListItem[]): TagFacet[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function computeSourceFacets(articles: ArticleListItem[]): SourceFacet[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    if (!article.source) continue;
    counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
