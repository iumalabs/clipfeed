import { assertEquals } from "@std/assert";
import { filterFacetsByLabel, splitTopFacets } from "./facetDisclosure.ts";

interface Facet {
  tag: string;
  count: number;
}

function facets(...pairs: Array<[string, number]>): Facet[] {
  return pairs.map(([tag, count]) => ({ tag, count }));
}

Deno.test("splitTopFacets: returns everything when at or under the cap", () => {
  const input = facets(["a", 5], ["b", 3], ["c", 1]);
  assertEquals(splitTopFacets(input, 3, false), { visible: input, hiddenCount: 0 });
});

Deno.test("splitTopFacets: fewer facets than the cap also returns everything", () => {
  const input = facets(["a", 5]);
  assertEquals(splitTopFacets(input, 15, false), { visible: input, hiddenCount: 0 });
});

Deno.test("splitTopFacets: truncates to topN and reports the hidden count", () => {
  const input = facets(["a", 5], ["b", 4], ["c", 3], ["d", 2], ["e", 1]);
  const result = splitTopFacets(input, 3, false);
  assertEquals(result.visible, facets(["a", 5], ["b", 4], ["c", 3]));
  assertEquals(result.hiddenCount, 2);
});

Deno.test("splitTopFacets: preserves caller's pre-sorted order (frequency desc, then alpha) — no re-sort", () => {
  // Two ties on count ("b" and "a" both at 2) — the tie-break is the
  // caller's job (computeTagFacets already does count desc, then
  // localeCompare), this function must not reorder anything itself.
  const input = facets(["z", 10], ["a", 2], ["b", 2]);
  const result = splitTopFacets(input, 2, false);
  assertEquals(result.visible, facets(["z", 10], ["a", 2]));
});

Deno.test("splitTopFacets: expanded=true bypasses the cap regardless of length", () => {
  const input = facets(["a", 5], ["b", 4], ["c", 3], ["d", 2], ["e", 1]);
  const result = splitTopFacets(input, 3, true);
  assertEquals(result.visible, input);
  assertEquals(result.hiddenCount, 0);
});

Deno.test("splitTopFacets: empty input returns empty, zero hidden", () => {
  assertEquals(splitTopFacets([], 15, false), { visible: [], hiddenCount: 0 });
});

Deno.test("filterFacetsByLabel: empty query returns every facet unfiltered", () => {
  const input = facets(["ai", 5], ["rust", 2]);
  assertEquals(filterFacetsByLabel(input, "", (f) => f.tag), input);
});

Deno.test("filterFacetsByLabel: whitespace-only query behaves like empty", () => {
  const input = facets(["ai", 5], ["rust", 2]);
  assertEquals(filterFacetsByLabel(input, "   ", (f) => f.tag), input);
});

Deno.test("filterFacetsByLabel: case-insensitive substring match", () => {
  const input = facets(["AI", 5], ["Air quality", 2], ["Rust", 1]);
  assertEquals(
    filterFacetsByLabel(input, "ai", (f) => f.tag),
    facets(["AI", 5], ["Air quality", 2]),
  );
});

Deno.test("filterFacetsByLabel: no match returns an empty array", () => {
  const input = facets(["ai", 5], ["rust", 2]);
  assertEquals(filterFacetsByLabel(input, "zzz", (f) => f.tag), []);
});
