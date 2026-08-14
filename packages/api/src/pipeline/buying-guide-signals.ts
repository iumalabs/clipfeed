// Shared signal-detection for "this reads like a shopping buying-guide /
// product roundup, not news reporting" — used at TWO independent layers that
// otherwise have no code in common: pre-LLM (article-classifier.ts's
// classifyArticleContent, tested against the raw extracted page) and
// post-LLM (pipeline.ts's post-summary gate, tested against the finished
// summary). Centralizing the signal patterns here means both layers agree on
// what counts, instead of two regex sets silently drifting apart.
//
// Deliberately conservative: requires BUYING_GUIDE_MIN_SIGNALS independent
// signals firing TOGETHER, never any single one — a genuine single-product
// review (e.g. "RTX 5090 review") routinely mentions one price and may use
// "best" loosely ("one of the best cards this generation"), but essentially
// never trips 3 of these 4 at once the way an actual "Best robot lawn mowers
// of 2026" comparison roundup does (several products, several prices,
// ranking language, a buy link).
export const BUYING_GUIDE_MIN_SIGNALS = 3;

// $X / $X,XXX(.XX) or a ruble-style amount — a proxy for "multiple products
// with prices," not a precise product count (counting actual distinct
// products would need real NLP). Three or more price-shaped tokens is what
// a comparison table/roundup reliably produces; a single-product review
// mentioning its own price once, or comparing it to one prior-gen price,
// stays under this.
const PRICE_TOKEN_PATTERN = /\$\s?\d[\d,.]*\b|\d[\d\s.,]*\s?(₽|руб\.?)/gi;
const MIN_PRICE_TOKENS = 3;

// Bilingual — this layer runs both pre-LLM (sources.json aggregates
// non-English feeds too, same reasoning as article-classifier.ts's
// ADVERTISEMENT_FILTER) and post-LLM against the RU summary (see
// summarize.ts's buildSystemPrompt: title_ru/body_ru/bullets_ru are always
// Russian by design), so an English-only pattern set would make the
// post-summary layer nearly blind.
const RANKING_LANGUAGE_PATTERN =
  /\b(best overall|top pick|our pick|editor'?s choice|runner-?up|budget pick)\b|лучший выбор|лучший вариант/i;

// Anchored to the START of the title (not a substring anywhere), same
// false-positive discipline as article-classifier.ts's BOILERPLATE_FILTER
// title patterns — a headline that merely mentions "the best" partway
// through must not match.
// Note: \b is an ASCII-only word-boundary in JS regex — Cyrillic letters
// aren't "word" characters to it, so the Russian alternatives below anchor
// on `^`/whitespace/literal text instead of `\b` around Cyrillic runs (the
// `\b` around the ASCII year digits still works fine, since 0-9 IS a JS
// \w character regardless of surrounding script).
const TITLE_SHAPE_PATTERN =
  /^(the )?best\b.{0,80}\b(20[2-9]\d)\b|^top\s+\d+\b|\bbuying guide\b|^лучши[ех]\s.{0,80}\b(20[2-9]\d)\b|^топ[- ]\d+(\s|$)|гид по покупке/i;

const BUY_CTA_PATTERN =
  /\b(buy now|shop now|check price|see (the )?price)\b|купить сейчас|узнать цену|посмотреть цену|где купить/i;

export interface BuyingGuideSignals {
  matchedSignals: string[];
  isBuyingGuide: boolean;
}

// title/text: whatever prose is available at the calling layer — the raw
// extracted page's title/body pre-LLM, or the finished summary's
// title+TL;DR+bullets+body post-LLM (RU by default — see the bilingual note
// above). Both are already plain text, never HTML, so no markup-stripping
// happens here.
export function detectBuyingGuideSignals(title: string, text: string): BuyingGuideSignals {
  const matchedSignals: string[] = [];

  const priceTokens = text.match(PRICE_TOKEN_PATTERN);
  if ((priceTokens?.length ?? 0) >= MIN_PRICE_TOKENS) {
    matchedSignals.push("multi_product_pricing");
  }
  if (RANKING_LANGUAGE_PATTERN.test(text)) matchedSignals.push("ranking_language");
  if (TITLE_SHAPE_PATTERN.test(title)) matchedSignals.push("title_shape");
  if (BUY_CTA_PATTERN.test(text)) matchedSignals.push("buy_cta");

  return {
    matchedSignals,
    isBuyingGuide: matchedSignals.length >= BUYING_GUIDE_MIN_SIGNALS,
  };
}
