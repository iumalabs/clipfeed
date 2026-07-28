import type { Dictionary } from "../i18n/i18n.ts";

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

  return (
    <div class="telegram-banner">
      <svg
        class="telegram-banner-icon"
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.301.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
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
    </div>
  );
}
