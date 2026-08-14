import { assertEquals } from "@std/assert";
import { BUYING_GUIDE_MIN_SIGNALS, detectBuyingGuideSignals } from "./buying-guide-signals.ts";

Deno.test("detectBuyingGuideSignals: a real 5-product roundup with prices, ranking language, and a shaped title trips the guard", () => {
  const title = "The best robot lawn mowers of 2026";
  const text =
    "We tested five robot lawn mowers on our own three-quarter-acre yard: the Husqvarna 420 IQ " +
    "($3,299), the Mammotion Luba 3 AWD 3000 ($2,799), the Segway Navimow X430 ($2,499), the " +
    "Dreame A3 AWD Pro 2500 ($3,099.99), and the Roborock RockNeo Q110H ($1,299). Our top pick is " +
    "the Navimow X430 — it never got stuck and mowed the whole lawn unattended. Check price at " +
    "Amazon.";
  const result = detectBuyingGuideSignals(title, text);
  assertEquals(result.isBuyingGuide, true);
  assertEquals(result.matchedSignals.length >= BUYING_GUIDE_MIN_SIGNALS, true);
  assertEquals(result.matchedSignals.includes("multi_product_pricing"), true);
  assertEquals(result.matchedSignals.includes("ranking_language"), true);
  assertEquals(result.matchedSignals.includes("title_shape"), true);
});

Deno.test("detectBuyingGuideSignals: a single-product GPU review is NOT flagged (only 1 signal, one price)", () => {
  const title = "NVIDIA RTX 5090 review: is it worth the upgrade?";
  const text =
    "The RTX 5090 launches at $1,999 and brings a substantial generational leap in ray-tracing " +
    "performance. In our benchmarks it outpaced the previous flagship by roughly 35% across " +
    "modern titles, though power draw climbed accordingly. For enthusiasts chasing 4K/120fps " +
    "with ray tracing enabled, it's a compelling — if expensive — upgrade.";
  const result = detectBuyingGuideSignals(title, text);
  assertEquals(result.isBuyingGuide, false);
  assertEquals(result.matchedSignals.length < BUYING_GUIDE_MIN_SIGNALS, true);
});

Deno.test("detectBuyingGuideSignals: exactly 2 of 4 signals does NOT trip the guard (stays conservative)", () => {
  const title = "Best laptops of 2026";
  const text =
    "We've tested dozens of laptops this year to find the best options for every budget. " +
    "As an Amazon Associate we may earn a commission from qualifying purchases.";
  // title_shape hits ("Best laptops of 2026"); nothing else does — no prices
  // at all, no ranking-language phrase, no buy CTA — so this must stay under
  // threshold even though it's a real listicle-shaped title.
  const result = detectBuyingGuideSignals(title, text);
  assertEquals(result.matchedSignals, ["title_shape"]);
  assertEquals(result.isBuyingGuide, false);
});

Deno.test("detectBuyingGuideSignals: ordinary news mentioning a single price is not flagged", () => {
  const title = "Regulator fines company over data collection practices";
  const text =
    "A regulator issued a record fine on Tuesday after finding the company misled users about " +
    "data collection, according to a new report. The company said it would appeal the $50 " +
    "million penalty.";
  const result = detectBuyingGuideSignals(title, text);
  assertEquals(result.isBuyingGuide, false);
});

Deno.test("detectBuyingGuideSignals: title_shape only matches a whole-title comparison shape, not a substring mid-headline", () => {
  const title = "Why some reviewers think this is the best phone you can buy right now";
  const result = detectBuyingGuideSignals(title, "Ordinary body with no other signals.");
  assertEquals(result.matchedSignals.includes("title_shape"), false);
});

Deno.test("detectBuyingGuideSignals: 'top N' and 'buying guide' title shapes both match", () => {
  assertEquals(detectBuyingGuideSignals("Top 5 mechanical keyboards", "").matchedSignals, [
    "title_shape",
  ]);
  assertEquals(
    detectBuyingGuideSignals("Robot vacuum buying guide", "").matchedSignals,
    ["title_shape"],
  );
});

Deno.test("detectBuyingGuideSignals: a Russian-language ranking phrase is recognized (bilingual)", () => {
  const result = detectBuyingGuideSignals(
    "Обычная статья",
    "Робот-газонокосилка Segway Navimow X430 — лучший выбор для автоматического ухода за газоном.",
  );
  assertEquals(result.matchedSignals.includes("ranking_language"), true);
});

Deno.test("detectBuyingGuideSignals: a Russian buying-guide title/CTA is recognized (bilingual), same threshold applies", () => {
  const title = "Лучшие робот-газонокосилки 2026 года";
  const text =
    "Мы протестировали пять робот-газонокосилок: Husqvarna 420 IQ (3299 ₽), Mammotion Luba 3 " +
    "(2799 ₽) и Segway Navimow X430 (2499 ₽). Это лучший выбор для автоматического ухода за " +
    "газоном. Узнать цену можно на сайте продавца.";
  const result = detectBuyingGuideSignals(title, text);
  assertEquals(result.isBuyingGuide, true);
  assertEquals(result.matchedSignals.includes("title_shape"), true);
  assertEquals(result.matchedSignals.includes("buy_cta"), true);
});

Deno.test("detectBuyingGuideSignals: multi_product_pricing requires at least 3 price-shaped tokens, not 2", () => {
  const twoOnly = detectBuyingGuideSignals(
    "Ordinary title",
    "The old model cost $199, the new one costs $249.",
  );
  assertEquals(twoOnly.matchedSignals.includes("multi_product_pricing"), false);

  const threeOrMore = detectBuyingGuideSignals(
    "Ordinary title",
    "Model A is $199, model B is $249, and model C is $299.",
  );
  assertEquals(threeOrMore.matchedSignals.includes("multi_product_pricing"), true);
});
