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
