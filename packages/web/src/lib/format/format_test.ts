import { assertEquals } from "@std/assert";
import { hostnameFromUrl, resolveCardDateIso } from "./format.ts";

Deno.test("hostnameFromUrl: extracts and lowercases the hostname", () => {
  assertEquals(hostnameFromUrl("https://Example.com/path/to/image.jpg"), "example.com");
});

Deno.test("hostnameFromUrl: strips a leading www.", () => {
  assertEquals(hostnameFromUrl("https://www.example.com/image.jpg"), "example.com");
});

Deno.test("hostnameFromUrl: an unparseable URL returns null", () => {
  assertEquals(hostnameFromUrl("not a url"), null);
});

// --- Task 61: the card shows published_at, falling back to added_at ---

Deno.test("resolveCardDateIso: a valid published_at is used as-is", () => {
  assertEquals(
    resolveCardDateIso("2026-07-10T08:00:00.000Z", "2026-07-29T12:00:00.000Z"),
    "2026-07-10T08:00:00.000Z",
  );
});

Deno.test("resolveCardDateIso: null published_at falls back to added_at", () => {
  assertEquals(
    resolveCardDateIso(null, "2026-07-29T12:00:00.000Z"),
    "2026-07-29T12:00:00.000Z",
  );
});

Deno.test("resolveCardDateIso: an unparseable published_at falls back to added_at", () => {
  assertEquals(
    resolveCardDateIso("not a date", "2026-07-29T12:00:00.000Z"),
    "2026-07-29T12:00:00.000Z",
  );
});

Deno.test("resolveCardDateIso: an empty-string published_at falls back to added_at", () => {
  assertEquals(
    resolveCardDateIso("", "2026-07-29T12:00:00.000Z"),
    "2026-07-29T12:00:00.000Z",
  );
});
