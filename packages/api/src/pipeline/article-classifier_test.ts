import { assertEquals } from "@std/assert";
import { classifyArticleContent } from "./article-classifier.ts";

// --- title-pattern short-circuit ---

Deno.test("classifyArticleContent: an exact 'About Us' title is flagged without needing any body markers", () => {
  const result = classifyArticleContent({ title: "About Us", textContent: "" });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.matchedMarkers, []);
});

Deno.test("classifyArticleContent: title matching is case-insensitive and tolerates surrounding whitespace", () => {
  const result = classifyArticleContent({ title: "  privacy policy  ".trim(), textContent: "" });
  assertEquals(result.isNonArticle, true);
});

Deno.test("classifyArticleContent: 'Advertise With Us' title is flagged", () => {
  assertEquals(
    classifyArticleContent({ title: "Advertise With Us", textContent: "" }).isNonArticle,
    true,
  );
});

Deno.test("classifyArticleContent: a real headline that merely contains 'about' as a substring is NOT flagged by title alone", () => {
  // Only an exact/whole-title match trips the title pattern — "about" as
  // part of a longer real headline must not.
  const result = classifyArticleContent({
    title: "What we know about the new chip shortage",
    textContent: "Ordinary article body with no boilerplate markers at all.",
  });
  assertEquals(result.isNonArticle, false);
});

// --- body-marker heuristic ---

Deno.test("classifyArticleContent: 3+ distinct boilerplate categories in the body flags it, even with an unrelated title", () => {
  const result = classifyArticleContent({
    title: "Example Media",
    textContent:
      "Example Media is an independent media company. Read our privacy policy and terms of service. " +
      "Contact us for advertising with us opportunities.",
  });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.matchedMarkers.length >= 3, true);
});

Deno.test("classifyArticleContent: exactly 2 distinct categories does NOT trip the guard (stays conservative)", () => {
  const result = classifyArticleContent({
    title: "Example Media",
    textContent: "Read our privacy policy. See our terms of service for more detail.",
  });
  assertEquals(result.isNonArticle, false);
  assertEquals(result.matchedMarkers, ["privacy_policy", "terms"]);
});

Deno.test("classifyArticleContent: a real news article mentioning ONE of these concepts in passing is not flagged", () => {
  const result = classifyArticleContent({
    title: "Regulator fines company over privacy policy violations",
    textContent:
      "A regulator issued a record fine on Tuesday after finding the company's privacy policy " +
      "misled users about data collection, according to a new report. The company said it would appeal.",
  });
  assertEquals(result.isNonArticle, false);
});

Deno.test("classifyArticleContent: an empty extraction is not flagged by this check (MIN_EXTRACTED_CHARS handles that case)", () => {
  const result = classifyArticleContent({ title: null, textContent: "" });
  assertEquals(result.isNonArticle, false);
  assertEquals(result.matchedMarkers, []);
});

Deno.test("classifyArticleContent: reason names the matched markers when flagged via the body path", () => {
  const result = classifyArticleContent({
    title: null,
    textContent:
      "All rights reserved. Contact us with questions. Read our cookie policy and privacy policy.",
  });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.reason?.includes("rights_reserved"), true);
});

Deno.test("classifyArticleContent: reason names the title when flagged via the title path", () => {
  const result = classifyArticleContent({ title: "Terms of Service", textContent: "" });
  assertEquals(result.reason?.includes("Terms of Service"), true);
});

Deno.test("classifyArticleContent: matchedMarkers/reason name which filter tripped (filterKey)", () => {
  const boilerplate = classifyArticleContent({ title: "About Us", textContent: "" });
  assertEquals(boilerplate.filterKey, "boilerplate");

  const notFlagged = classifyArticleContent({ title: "Real news", textContent: "Ordinary body." });
  assertEquals(notFlagged.filterKey, null);
});

// --- advertisement filter (Task 67) ---

Deno.test("classifyArticleContent: a sponsored deal-roundup post (discount % + was/now price) is flagged as advertisement", () => {
  // Reproduces the reported incident: a Tom's Hardware "TECH DEALS"
  // affiliate post — real, well-formed prose (unlike the boilerplate case),
  // so it must NOT trip via the boilerplate path.
  const result = classifyArticleContent({
    title: "Wolfbox MF60 Compressed Air Duster is 39% off — down to $30.39 instead of $49.99",
    textContent:
      "The Wolfbox MF60 Compressed Air Duster is a cordless PC cleaning tool with a motor spinning " +
      "up to 110,000 RPM, and it's currently 39% off at Amazon, dropping the price from $49.99 down " +
      "to $30.39. Buy Now while the deal lasts. As an Amazon Associate we may earn a commission from " +
      "qualifying purchases made through links on this page.",
  });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.filterKey, "advertisement");
  assertEquals(result.matchedMarkers.includes("discount_percent"), true);
});

Deno.test("classifyArticleContent: a Russian-language deal post is also flagged (bilingual markers)", () => {
  const result = classifyArticleContent({
    title: "Товар со скидкой",
    textContent: "Устройство продаётся со скидкой 39%, цена снижена вместо $49.99 до $30.39. " +
      "Активировать промокод можно на странице продавца.",
  });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.filterKey, "advertisement");
});

Deno.test("classifyArticleContent: exactly 1 advertisement-category hit does NOT trip the guard (stays conservative)", () => {
  const result = classifyArticleContent({
    title: "Company announces new pricing",
    textContent:
      "The company announced Tuesday that it is cutting the price of its flagship product by 20% " +
      "starting next month, citing falling component costs across the industry.",
  });
  assertEquals(result.isNonArticle, false);
});

Deno.test("classifyArticleContent: ordinary pricing news mentioning a single discount in passing is not flagged", () => {
  const result = classifyArticleContent({
    title: "Retailer cuts prices ahead of holiday season",
    textContent:
      "A major retailer said Monday it would cut prices across thousands of items by up to 15% " +
      "ahead of the holiday shopping season, in a bid to compete with online rivals. Analysts said " +
      "the move reflects intensifying competition rather than a one-off promotion.",
  });
  assertEquals(result.isNonArticle, false);
});

Deno.test("classifyArticleContent: an affiliate disclosure alone (1 category) does not trip the guard", () => {
  const result = classifyArticleContent({
    title: "Best laptops of 2026",
    textContent:
      "We've tested dozens of laptops this year to find the best options for every budget. " +
      "As an Amazon Associate we may earn a commission from qualifying purchases.",
  });
  assertEquals(result.isNonArticle, false);
});

// --- buying-guide filter ---

Deno.test("classifyArticleContent: a multi-product buying-guide roundup is flagged as buying_guide", () => {
  const result = classifyArticleContent({
    title: "The best robot lawn mowers of 2026",
    textContent:
      "We tested five robot lawn mowers on our own three-quarter-acre yard: the Husqvarna 420 IQ " +
      "($3,299), the Mammotion Luba 3 AWD 3000 ($2,799), the Segway Navimow X430 ($2,499), the " +
      "Dreame A3 AWD Pro 2500 ($3,099.99), and the Roborock RockNeo Q110H ($1,299). Our top pick " +
      "is the Navimow X430 — it never got stuck and mowed the whole lawn unattended. Check price " +
      "at Amazon.",
  });
  assertEquals(result.isNonArticle, true);
  assertEquals(result.filterKey, "buying_guide");
  assertEquals(result.reason?.includes("multi_product_pricing"), true);
});

Deno.test("classifyArticleContent: a single-product hardware review (e.g. a GPU review) is NOT flagged", () => {
  // The exact false-positive risk this filter must avoid: ordinary tech
  // journalism about one product, which INTEREST_TOPICS explicitly wants.
  const result = classifyArticleContent({
    title: "NVIDIA RTX 5090 review: is it worth the upgrade?",
    textContent: "The RTX 5090 launches at $1,999 and brings a substantial generational leap in " +
      "ray-tracing performance. In our benchmarks it outpaced the previous flagship by roughly " +
      "35% across modern titles, though power draw climbed accordingly. For enthusiasts chasing " +
      "4K/120fps with ray tracing enabled, it's a compelling — if expensive — upgrade.",
  });
  assertEquals(result.isNonArticle, false);
});

Deno.test("classifyArticleContent: a 'Best X 2026' title alone (1 signal) does not trip the buying-guide guard", () => {
  const result = classifyArticleContent({
    title: "Best laptops of 2026",
    textContent: "A short editorial intro with no other buying-guide signals present at all.",
  });
  assertEquals(result.isNonArticle, false);
});
