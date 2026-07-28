import type { DateSection } from "./dateGrouping.ts";

// Task 51: resolves what a section header should display — the server's
// real "Earlier" total when available (fixing the bug where it showed only
// however many rows had been lazy-loaded so far, e.g. 12 climbing to 92 as
// the user clicked "show more"), falling back to the loaded-count
// computation otherwise (endpoint not yet resolved, or failed — see
// App.tsx's articleCounts state). Today/Yesterday are always fully loaded
// by the time Feed renders (see App.tsx's initial-load effect), so the
// local computation was never wrong for them — only "earlier" needs the
// override.
export function resolveSectionCount(
  section: DateSection,
  localCount: number,
  earlierCount: number | null,
): number {
  if (section === "earlier" && earlierCount !== null) return earlierCount;
  return localCount;
}
