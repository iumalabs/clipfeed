import { assertEquals } from "@std/assert";
import { isValidTelegramChannelUrl } from "./telegramConfig.ts";

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
