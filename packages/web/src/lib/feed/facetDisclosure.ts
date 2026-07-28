// Task 54: the mobile filters bottom sheet caps how many tag/source pills it
// shows up front — a feed with ~50 tags (many one-offs like "ssh (1)") would
// otherwise just recreate the "wall of pills" problem the sheet exists to
// fix, only one tap deeper. Callers pass facets already sorted frequency
// desc, then alphabetically (see App.tsx's computeTagFacets/
// computeSourceFacets) — this module doesn't re-sort, only splits/filters.

export interface DisclosureResult<T> {
  visible: T[];
  hiddenCount: number;
}

// `expanded` bypasses the cap entirely — the sheet's own "показать все" /
// "show all" toggle just flips this rather than tracking a second, separate
// list.
export function splitTopFacets<T>(
  facets: readonly T[],
  topN: number,
  expanded: boolean,
): DisclosureResult<T> {
  if (expanded || facets.length <= topN) {
    return { visible: [...facets], hiddenCount: 0 };
  }
  return { visible: facets.slice(0, topN), hiddenCount: facets.length - topN };
}

// The sheet's "find a tag quickly" search box — plain case-insensitive
// substring match, no fuzzy scoring (the whole point is a fast, predictable
// narrow-down over what's likely already a short visible list).
export function filterFacetsByLabel<T>(
  facets: readonly T[],
  query: string,
  getLabel: (facet: T) => string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...facets];
  return facets.filter((facet) => getLabel(facet).toLowerCase().includes(needle));
}
