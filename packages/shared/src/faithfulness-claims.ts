import type { SummaryJson } from "./types.ts";

export interface FaithfulnessClaimInput {
  i: number;
  text: string;
}

// Builds the claim set the faithfulness judge verifies (see
// packages/api/src/pipeline/faithfulness.ts, which re-exports this as
// buildFaithfulnessClaims). Task 35 Part A: RU fields only — the owner's
// default RU-only generation no longer produces _en fields for a fresh
// summary, so RU is the one thing this check can rely on across every
// article. Claim granularity is deliberately coarse: one claim per
// tldr/bullet/body-paragraph array element, not split into individual
// sentences — keeps the judge prompt short and the call cheap, since this
// runs on every single article when enabled.
//
// Lives in shared/ (not api/) rather than being api-only: claim 1 is
// always the tldr, the next bullets_ru.length claims are the bullets in
// order, everything after that is a body paragraph in order — and BOTH the
// API's own remediation retry (buildFaithfulnessRetryViolations, which maps
// a judged claim index back to its text) and the SPA's owner-only
// per-claim detail view (ArticleCard's faithfulness footnote, which does
// the exact same index -> text lookup to show what was actually flagged)
// need that identical ordering. One implementation here means the two
// consumers can never silently drift apart the way a hand-duplicated copy
// could.
export function buildFaithfulnessClaimTexts(summary: SummaryJson): FaithfulnessClaimInput[] {
  const units = [summary.tldr_ru, ...summary.bullets_ru, ...summary.body_ru];
  return units.map((text, idx) => ({ i: idx + 1, text }));
}
