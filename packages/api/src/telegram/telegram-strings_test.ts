import { assertEquals } from "@std/assert";
import {
  agentAlreadyRanWarning,
  alreadySavedText,
  digestHeader,
  failedText,
  readySuccessText,
} from "./telegram-strings.ts";

Deno.test("readySuccessText: formats title/tldr/feed link on separate lines", () => {
  assertEquals(
    readySuccessText("Заголовок", "Краткое содержание.", "https://example.com"),
    "✓ Заголовок\n\nКраткое содержание.\n\nhttps://example.com",
  );
});

Deno.test("readySuccessText: omits the feed link entirely when null", () => {
  assertEquals(
    readySuccessText("Заголовок", "Краткое содержание.", null),
    "✓ Заголовок\n\nКраткое содержание.",
  );
});

Deno.test("readySuccessText: truncates to the 4096-char Telegram message limit", () => {
  const longTldr = "а".repeat(5000);
  const text = readySuccessText("Заголовок", longTldr, null);
  assertEquals(text.length, 4096);
  assertEquals(text.endsWith("…"), true);
});

Deno.test("failedText: includes the reason and a retry hint", () => {
  assertEquals(
    failedText("daily-limit"),
    "✗ Не получилось: daily-limit. Retry: открой ленту.",
  );
});

Deno.test("failedText: truncates a very long reason to the message limit", () => {
  const text = failedText("x".repeat(5000));
  assertEquals(text.length, 4096);
});

Deno.test("digestHeader: includes the article count", () => {
  assertEquals(digestHeader(3), "ClipFeed — за сутки: 3 статей");
  assertEquals(digestHeader(1), "ClipFeed — за сутки: 1 статей");
});

Deno.test("agentAlreadyRanWarning: names the picks count and UTC clock time, states it's running again", () => {
  assertEquals(
    agentAlreadyRanWarning(10, "05:00"),
    "Сегодня агент уже отработал: 10 статей в 05:00 UTC. Запускаю ещё раз.",
  );
});

// --- alreadySavedText (Task 55) ---

Deno.test("alreadySavedText: ready and not archived names 'уже в ленте', no link when null", () => {
  assertEquals(alreadySavedText("ready", false, null), "Уже сохранено — статья уже в ленте.");
});

Deno.test("alreadySavedText: archived takes priority over status", () => {
  assertEquals(alreadySavedText("ready", true, null), "Уже сохранено — статья в архиве.");
  assertEquals(alreadySavedText("failed", true, null), "Уже сохранено — статья в архиве.");
});

Deno.test("alreadySavedText: failed and not archived names 'не обработалась'", () => {
  assertEquals(
    alreadySavedText("failed", false, null),
    "Уже сохранено — статья не обработалась — можно повторить.",
  );
});

Deno.test("alreadySavedText: pending and not archived names 'ещё обрабатывается'", () => {
  assertEquals(
    alreadySavedText("pending", false, null),
    "Уже сохранено — статья ещё обрабатывается.",
  );
});

Deno.test("alreadySavedText: appends the card link on its own line when given", () => {
  assertEquals(
    alreadySavedText("ready", false, "https://example.com/a/abc123"),
    "Уже сохранено — статья уже в ленте.\n\nhttps://example.com/a/abc123",
  );
});
