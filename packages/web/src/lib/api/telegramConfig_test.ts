import { assertEquals } from "@std/assert";
import { deriveTelegramWebPreviewUrl, isValidTelegramChannelUrl } from "./telegramConfig.ts";

Deno.test("isValidTelegramChannelUrl - a well-formed https://t.me/<name> URL is valid", () => {
  assertEquals(isValidTelegramChannelUrl("https://t.me/clipfeedchannel"), true);
});

Deno.test("isValidTelegramChannelUrl - empty string is invalid (the default, unset TELEGRAM_CHANNEL_URL)", () => {
  assertEquals(isValidTelegramChannelUrl(""), false);
});

Deno.test("isValidTelegramChannelUrl - null/undefined are invalid", () => {
  assertEquals(isValidTelegramChannelUrl(null), false);
  assertEquals(isValidTelegramChannelUrl(undefined), false);
});

Deno.test("isValidTelegramChannelUrl - an http:// (non-https) URL is invalid", () => {
  assertEquals(isValidTelegramChannelUrl("http://t.me/clipfeedchannel"), false);
});

Deno.test("isValidTelegramChannelUrl - a different domain (not t.me) is invalid", () => {
  assertEquals(isValidTelegramChannelUrl("https://telegram.me/clipfeedchannel"), false);
  assertEquals(isValidTelegramChannelUrl("https://example.com/t.me/clipfeedchannel"), false);
});

Deno.test("isValidTelegramChannelUrl - a bare https://t.me/ with no channel name is invalid", () => {
  assertEquals(isValidTelegramChannelUrl("https://t.me/"), false);
  assertEquals(isValidTelegramChannelUrl("https://t.me"), false);
});

Deno.test("isValidTelegramChannelUrl - a bare domain with no scheme is invalid", () => {
  assertEquals(isValidTelegramChannelUrl("t.me/clipfeedchannel"), false);
});

Deno.test("isValidTelegramChannelUrl - unparseable garbage is invalid, not a throw", () => {
  assertEquals(isValidTelegramChannelUrl("not a url at all"), false);
});

Deno.test("deriveTelegramWebPreviewUrl - a well-formed URL derives the /s/ web-preview form", () => {
  assertEquals(
    deriveTelegramWebPreviewUrl("https://t.me/clipfeedchannel"),
    "https://t.me/s/clipfeedchannel",
  );
});

Deno.test("deriveTelegramWebPreviewUrl - a channel name with underscores and digits is preserved", () => {
  assertEquals(
    deriveTelegramWebPreviewUrl("https://t.me/my_channel_123"),
    "https://t.me/s/my_channel_123",
  );
});

Deno.test("deriveTelegramWebPreviewUrl - a trailing slash on the channel path is ignored", () => {
  assertEquals(
    deriveTelegramWebPreviewUrl("https://t.me/clipfeedchannel/"),
    "https://t.me/s/clipfeedchannel",
  );
});

Deno.test("deriveTelegramWebPreviewUrl - a query string (e.g. a ?start= deep-link param) is dropped", () => {
  assertEquals(
    deriveTelegramWebPreviewUrl("https://t.me/clipfeedchannel?start=promo"),
    "https://t.me/s/clipfeedchannel",
  );
});

Deno.test("deriveTelegramWebPreviewUrl - invalid/unset input returns null (hides both banner links)", () => {
  assertEquals(deriveTelegramWebPreviewUrl(""), null);
  assertEquals(deriveTelegramWebPreviewUrl(null), null);
  assertEquals(deriveTelegramWebPreviewUrl(undefined), null);
  assertEquals(deriveTelegramWebPreviewUrl("https://t.me/"), null);
  assertEquals(deriveTelegramWebPreviewUrl("http://t.me/clipfeedchannel"), null);
  assertEquals(deriveTelegramWebPreviewUrl("https://telegram.me/clipfeedchannel"), null);
  assertEquals(deriveTelegramWebPreviewUrl("not a url at all"), null);
});
