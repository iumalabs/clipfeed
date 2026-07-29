import type { FaithfulnessJson, FaithfulnessVerdict, SummaryJson } from "@clipfeed/shared/types";
import { buildFaithfulnessClaimTexts } from "../../../../shared/src/faithfulness-claims.ts";
import type { Dictionary } from "../../i18n/i18n.ts";

export interface FlaggedFaithfulnessClaim {
  text: string;
  verdict: "unsupported" | "contradicted";
  evidence: string;
}

// Reads the judge's per-claim detail out of the owner-only faithfulness_json
// field (see ArticleCard.tsx's owner-mode footnote) and resolves each
// flagged claim back to the actual summary sentence it refers to — a plain
// unsupported/contradicted COUNT tells the owner something was flagged but
// gives them nothing to act on; the actual sentence does. Uses the same
// claim-index ordering the API's own remediation retry relies on (see
// shared/src/faithfulness-claims.ts's doc comment for why that lives in
// shared/ rather than being duplicated here). Returns [] for the {error}
// shape (judge unparseable), when the field itself is null (check disabled/
// not run/visitor-stripped — see PublicArticle in @clipfeed/shared/types),
// when summary_json is missing, or when every claim came back 'supported'.
export function resolveFlaggedClaims(
  summary: SummaryJson | null,
  json: FaithfulnessJson | null,
): FlaggedFaithfulnessClaim[] {
  if (!summary || !json || !("claims" in json)) return [];
  const textByIndex = new Map(buildFaithfulnessClaimTexts(summary).map((c) => [c.i, c.text]));
  const flagged: FlaggedFaithfulnessClaim[] = [];
  for (const claim of json.claims) {
    if (claim.verdict === "supported") continue;
    const text = textByIndex.get(claim.i);
    if (!text) continue;
    flagged.push({ text, verdict: claim.verdict, evidence: claim.evidence });
  }
  return flagged;
}

export interface FaithfulnessBadgeInfo {
  badgeText: string;
  tooltipText: string;
}

// Task 34 Part B: the badge (and its tooltip) only ever appear for 'weak'/
// 'fail' — 'pass' and null (check disabled/not run/visitor-stripped) get
// nothing, a normal summary needs no caveat. Pulled out as its own pure
// function (rather than inlined ternaries in ArticleCard.tsx) so "which
// verdicts get a badge at all" is directly unit-testable without rendering
// the component.
export function faithfulnessBadgeInfo(
  dict: Dictionary,
  verdict: FaithfulnessVerdict | null,
): FaithfulnessBadgeInfo | null {
  if (verdict === "weak") {
    return {
      badgeText: dict.faithfulnessBadgeWeak,
      tooltipText: `${dict.faithfulnessTooltipWeak} ${dict.faithfulnessTooltipTrailer}`,
    };
  }
  if (verdict === "fail") {
    return {
      badgeText: dict.faithfulnessBadgeFail,
      tooltipText: `${dict.faithfulnessTooltipFail} ${dict.faithfulnessTooltipTrailer}`,
    };
  }
  return null;
}

// Task 42 Part B: the badge became an internal quality signal, not a
// reader-facing disclaimer — a visitor never sees it, in ANY verdict state,
// including both 'weak' and 'fail'. Owner mode is unaffected (still gated
// by faithfulnessBadgeInfo's own verdict check above). Pulled out as its
// own pure function — same reasoning as faithfulnessBadgeInfo itself: the
// gating logic belongs in a unit-testable helper, not inlined as a ternary
// in ArticleCard.tsx where it can't be exercised without rendering the
// component.
export function visibleFaithfulnessBadgeInfo(
  dict: Dictionary,
  verdict: FaithfulnessVerdict | null,
  isOwner: boolean,
): FaithfulnessBadgeInfo | null {
  if (!isOwner) return null;
  return faithfulnessBadgeInfo(dict, verdict);
}
