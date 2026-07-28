import type { Dictionary } from "../i18n/i18n.ts";
import { deriveTelegramWebPreviewUrl } from "../lib/api/telegramConfig.ts";
import { TelegramIcon } from "./TelegramIcon.tsx";

export interface TelegramBannerProps {
  dict: Dictionary;
  telegramChannelUrl: string | null;
}

// Task 56: compact "Subscribe on Telegram" CTA — shared between the desktop
// Sidebar and the mobile FilterSheet (Task 54 moved the sidebar's content
// into that sheet on mobile), so both surfaces stay in sync automatically.
// Renders nothing when telegramChannelUrl is null (unset or invalid
// TELEGRAM_CHANNEL_URL — see lib/api/telegramConfig.ts's isValidTelegramChannelUrl),
// which is the fork-neutral default: no hardcoded channel anywhere.
export function TelegramBanner({ dict, telegramChannelUrl }: TelegramBannerProps) {
  if (!telegramChannelUrl) return null;

  // Task 57: https://t.me/<name> triggers Telegram's app handoff (an iOS
  // Smart App Banner meta tag plus a "View in Telegram" tg:// button) —
  // browsers that refuse the tg:// scheme (e.g. Brave on iOS) dead-end on a
  // "Cannot Open Page" dialog. https://t.me/s/<name> renders the same
  // channel as a plain web page with neither mechanism present, so it's
  // offered as a secondary, explicit path — derived from the exact same
  // config value as the primary link, never a separate/hardcoded URL.
  const webPreviewUrl = deriveTelegramWebPreviewUrl(telegramChannelUrl);

  return (
    <div class="telegram-banner">
      <TelegramIcon class="telegram-banner-icon" width={22} height={22} />
      <p class="telegram-banner-text">{dict.telegramBannerText}</p>
      <a
        class="telegram-banner-button"
        href={telegramChannelUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={dict.telegramBannerAria}
      >
        {dict.telegramBannerButton}
      </a>
      {webPreviewUrl && (
        <a
          class="telegram-banner-webfallback"
          href={webPreviewUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {dict.telegramBannerWebFallback}
        </a>
      )}
    </div>
  );
}
