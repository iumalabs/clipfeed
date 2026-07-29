import { assertEquals } from "@std/assert";
import {
  faithfulnessBadgeInfo,
  resolveFlaggedClaims,
  visibleFaithfulnessBadgeInfo,
} from "./faithfulness.ts";
import { dictionaries } from "../../i18n/i18n.ts";
import type { SummaryJson } from "@clipfeed/shared/types";

const SAMPLE_SUMMARY: SummaryJson = {
  title_ru: "Заголовок",
  tldr_ru: "Краткое содержание.",
  body_ru: ["Первый абзац.", "Второй абзац."],
  bullets_ru: ["Пункт один.", "Пункт два."],
  tags: ["testing"],
  lang_original: "en",
};

Deno.test("resolveFlaggedClaims: null summary -> []", () => {
  assertEquals(
    resolveFlaggedClaims(null, {
      claims: [{ i: 1, verdict: "unsupported", evidence: "" }],
      notes: "",
    }),
    [],
  );
});

Deno.test("resolveFlaggedClaims: null json (disabled/not run/visitor mode) -> []", () => {
  assertEquals(resolveFlaggedClaims(SAMPLE_SUMMARY, null), []);
});

Deno.test("resolveFlaggedClaims: error shape (judge unparseable) -> []", () => {
  assertEquals(resolveFlaggedClaims(SAMPLE_SUMMARY, { error: "judge unparseable" }), []);
});

Deno.test("resolveFlaggedClaims: all-supported claims -> []", () => {
  assertEquals(
    resolveFlaggedClaims(SAMPLE_SUMMARY, {
      claims: [{ i: 1, verdict: "supported", evidence: "" }],
      notes: "",
    }),
    [],
  );
});

Deno.test("resolveFlaggedClaims: resolves an unsupported bullet claim to its actual text (claim 2 = bullets_ru[0])", () => {
  const flagged = resolveFlaggedClaims(SAMPLE_SUMMARY, {
    claims: [
      { i: 1, verdict: "supported", evidence: "" },
      { i: 2, verdict: "unsupported", evidence: "no matching source span" },
    ],
    notes: "",
  });
  assertEquals(flagged, [
    { text: "Пункт один.", verdict: "unsupported", evidence: "no matching source span" },
  ]);
});

Deno.test("resolveFlaggedClaims: resolves a contradicted tldr claim (claim 1 = tldr_ru)", () => {
  const flagged = resolveFlaggedClaims(SAMPLE_SUMMARY, {
    claims: [{ i: 1, verdict: "contradicted", evidence: "source says the opposite" }],
    notes: "",
  });
  assertEquals(flagged, [
    { text: "Краткое содержание.", verdict: "contradicted", evidence: "source says the opposite" },
  ]);
});

Deno.test("resolveFlaggedClaims: resolves a body-paragraph claim (after tldr + all bullets)", () => {
  // claim 1 = tldr, claims 2-3 = the 2 bullets, claim 4 = body_ru[0]
  const flagged = resolveFlaggedClaims(SAMPLE_SUMMARY, {
    claims: [{ i: 4, verdict: "unsupported", evidence: "" }],
    notes: "",
  });
  assertEquals(flagged, [{ text: "Первый абзац.", verdict: "unsupported", evidence: "" }]);
});

Deno.test("resolveFlaggedClaims: ignores supported claims but keeps unsupported/contradicted ones, in judge order", () => {
  const flagged = resolveFlaggedClaims(SAMPLE_SUMMARY, {
    claims: [
      { i: 1, verdict: "supported", evidence: "" },
      { i: 3, verdict: "contradicted", evidence: "e1" },
      { i: 2, verdict: "unsupported", evidence: "e2" },
    ],
    notes: "",
  });
  assertEquals(flagged, [
    { text: "Пункт два.", verdict: "contradicted", evidence: "e1" },
    { text: "Пункт один.", verdict: "unsupported", evidence: "e2" },
  ]);
});

Deno.test("resolveFlaggedClaims: a claim index with no matching text (out of range) is dropped, not shown blank", () => {
  const flagged = resolveFlaggedClaims(SAMPLE_SUMMARY, {
    claims: [{ i: 99, verdict: "unsupported", evidence: "" }],
    notes: "",
  });
  assertEquals(flagged, []);
});

// --- faithfulnessBadgeInfo (Task 34 Part B): the badge/tooltip only ever ---
// --- appear for 'weak'/'fail' — this is what ArticleCard.tsx's badge row ---
// --- render condition ultimately depends on. ---

Deno.test("faithfulnessBadgeInfo: 'pass' verdict -> no badge/tooltip at all", () => {
  assertEquals(faithfulnessBadgeInfo(dictionaries.ru, "pass"), null);
});

Deno.test("faithfulnessBadgeInfo: null verdict (disabled/not run) -> no badge/tooltip at all", () => {
  assertEquals(faithfulnessBadgeInfo(dictionaries.ru, null), null);
});

Deno.test("faithfulnessBadgeInfo: 'weak' verdict -> the weak badge text and a tooltip ending in the shared trailer", () => {
  const info = faithfulnessBadgeInfo(dictionaries.ru, "weak");
  assertEquals(info?.badgeText, dictionaries.ru.faithfulnessBadgeWeak);
  assertEquals(info?.tooltipText.startsWith(dictionaries.ru.faithfulnessTooltipWeak), true);
  assertEquals(info?.tooltipText.endsWith(dictionaries.ru.faithfulnessTooltipTrailer), true);
});

Deno.test("faithfulnessBadgeInfo: 'fail' verdict -> the fail badge text and a tooltip ending in the shared trailer", () => {
  const info = faithfulnessBadgeInfo(dictionaries.en, "fail");
  assertEquals(info?.badgeText, dictionaries.en.faithfulnessBadgeFail);
  assertEquals(info?.tooltipText.startsWith(dictionaries.en.faithfulnessTooltipFail), true);
  assertEquals(info?.tooltipText.endsWith(dictionaries.en.faithfulnessTooltipTrailer), true);
});

Deno.test("faithfulnessBadgeInfo: 'weak' and 'fail' use DIFFERENT tooltip copy, both languages", () => {
  for (const dict of [dictionaries.ru, dictionaries.en]) {
    const weak = faithfulnessBadgeInfo(dict, "weak");
    const fail = faithfulnessBadgeInfo(dict, "fail");
    assertEquals(weak?.tooltipText === fail?.tooltipText, false);
    assertEquals(weak?.badgeText === fail?.badgeText, false);
  }
});

// --- visibleFaithfulnessBadgeInfo (Task 42 Part B): reader-facing gate — ---
// --- a visitor never sees the badge, in EITHER 'weak' or 'fail' state; ---
// --- owner mode is unaffected and still follows faithfulnessBadgeInfo's ---
// --- own verdict rule. One test per (verdict, isOwner) combination. ---

Deno.test("visibleFaithfulnessBadgeInfo: visitor + 'weak' -> null (never shown)", () => {
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, "weak", false), null);
});

Deno.test("visibleFaithfulnessBadgeInfo: visitor + 'fail' -> null (never shown)", () => {
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, "fail", false), null);
});

Deno.test("visibleFaithfulnessBadgeInfo: visitor + 'pass'/null -> null either way (nothing to hide)", () => {
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, "pass", false), null);
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, null, false), null);
});

Deno.test("visibleFaithfulnessBadgeInfo: owner + 'weak' -> the weak badge, unchanged from faithfulnessBadgeInfo", () => {
  const info = visibleFaithfulnessBadgeInfo(dictionaries.ru, "weak", true);
  assertEquals(info, faithfulnessBadgeInfo(dictionaries.ru, "weak"));
  assertEquals(info?.badgeText, dictionaries.ru.faithfulnessBadgeWeak);
});

Deno.test("visibleFaithfulnessBadgeInfo: owner + 'fail' -> the fail badge, unchanged from faithfulnessBadgeInfo", () => {
  const info = visibleFaithfulnessBadgeInfo(dictionaries.en, "fail", true);
  assertEquals(info, faithfulnessBadgeInfo(dictionaries.en, "fail"));
  assertEquals(info?.badgeText, dictionaries.en.faithfulnessBadgeFail);
});

Deno.test("visibleFaithfulnessBadgeInfo: owner + 'pass'/null -> still null (owner mode doesn't force a badge to appear)", () => {
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, "pass", true), null);
  assertEquals(visibleFaithfulnessBadgeInfo(dictionaries.ru, null, true), null);
});
