// Task 56: single source of truth for the "Subscribe on Telegram" banner
// (Sidebar.tsx/FilterSheet.tsx). Backed by GET /api/config's
// `telegram_channel_url` field — [vars] TELEGRAM_CHANNEL_URL defaults to ""
// (per the forkability policy, never an owner-specific default), so a fresh
// fork simply shows no banner until the owner sets their own channel.
// Distinct from TELEGRAM_CHANNEL_ID (the API-side internal id the publisher
// posts to) — this is the public, human-facing https://t.me/<name> link.

import { loadRawConfig } from "./config.ts";

// The pure, directly-testable gating rule: only render the banner for a
// well-formed https://t.me/<something> URL. Guards against a misconfigured
// TELEGRAM_CHANNEL_URL (a bare channel name, an http:// link, a different
// domain, or a bare "https://t.me/" with no channel) ever producing a
// broken, insecure, or dead-end banner link.
export function isValidTelegramChannelUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname === "t.me" && parsed.pathname.length > 1;
}

// Reads its slice of the single shared GET /api/config fetch (see
// lib/api/config.ts) — a fetch failure degrades to "no banner shown", never
// blocks rendering the rest of the app.
export async function loadTelegramChannelUrl(): Promise<string | null> {
  const body = await loadRawConfig();
  return isValidTelegramChannelUrl(body.telegram_channel_url) ? body.telegram_channel_url! : null;
}
