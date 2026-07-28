// User-facing bot replies — the owner's language, Russian. Kept in this one
// module so every other Telegram-related file can stay English-only for
// its code and comments.

import type { ArticleStatus } from "@clipfeed/shared/types";

const TELEGRAM_MESSAGE_LIMIT = 4096;

function truncateToTelegramLimit(text: string): string {
  return text.length > TELEGRAM_MESSAGE_LIMIT
    ? `${text.slice(0, TELEGRAM_MESSAGE_LIMIT - 1)}…`
    : text;
}

export const NON_OWNER_REPLY = "Это персональный бот.";

export const HELP_TEXT =
  "Отправь ссылку — сохраню её в ленту (если сайт блокирует ботов через robots.txt, допиши «force» после ссылки, чтобы сохранить всё равно).\n\n/digest — прислать выжимку за сутки.\n/scrape — запустить агента прямо сейчас (если уже запускался сегодня, предупрежу перед повтором; /scrape force — без предупреждения).\n/publish — опубликовать следующую статью из очереди сейчас же.";

export const SAVING_TEXT = "Сохраняю…";

// Task 55: names the existing article's state instead of a bare "already
// saved" — a duplicate hit used to be a dead end (the owner couldn't tell
// whether the exact match was ready, archived, or had failed processing
// entirely). `cardLink` is the "/a/<id>" card URL (built by the caller via
// telegram-post.ts's cardUrl) — omitted when PUBLIC_BASE_URL isn't
// configured, same graceful-degradation rule the publish flow already uses.
export function alreadySavedText(
  status: ArticleStatus,
  archived: boolean,
  cardLink: string | null,
): string {
  const state = archived
    ? "статья в архиве"
    : status === "failed"
    ? "статья не обработалась — можно повторить"
    : status === "pending"
    ? "статья ещё обрабатывается"
    : "статья уже в ленте";
  const lines = [`Уже сохранено — ${state}.`];
  if (cardLink) lines.push("", cardLink);
  return truncateToTelegramLimit(lines.join("\n"));
}

// Task 48: shown when a Telegram-submitted URL's robots.txt disallows a
// generic bot fetch — the owner can resend the same link with "force"
// appended (same override wording style as "/scrape force") to save it
// anyway.
export const ROBOTS_BLOCKED_TEXT =
  "Сайт запрещает автоматический доступ (robots.txt). Чтобы сохранить всё равно, отправь ссылку ещё раз со словом «force» в конце.";

export const NO_DIGEST_ARTICLES_TEXT = "За последние сутки новых статей нет.";

export const AGENT_STARTED_TEXT = "Запустил агента";

export const PUBLISH_EMPTY_TEXT = "Нечего публиковать — очередь пуста.";

export const PUBLISH_SUCCESS_TEXT = "Опубликовано.";

export const PUBLISH_SKIPPED_TEXT =
  "Следующая статья в очереди не прошла проверку достоверности — пропущена без публикации.";

export const PUBLISH_FAILED_TEXT = "Не получилось опубликовать — попробуй ещё раз.";

export function readySuccessText(
  titleRu: string,
  tldrRu: string,
  feedUrl: string | null,
): string {
  const lines = [`✓ ${titleRu}`, "", tldrRu];
  if (feedUrl) {
    lines.push("", feedUrl);
  }
  return truncateToTelegramLimit(lines.join("\n"));
}

export function failedText(reason: string): string {
  return truncateToTelegramLimit(`✗ Не получилось: ${reason}. Retry: открой ленту.`);
}

export function digestHeader(articleCount: number): string {
  return `ClipFeed — за сутки: ${articleCount} статей`;
}

// Task 36 Part B §3: shown before a manual agent trigger (POST
// /api/admin/agent/run, /scrape) proceeds anyway, when the agent already
// ran today — names the most recent prior run (picks count + UTC clock
// time) so the owner isn't surprised by a doubled batch. "статей" left
// unconditional (no Russian plural agreement) — same simplification
// digestHeader above already makes.
export function agentAlreadyRanWarning(picks: number, timeUtc: string): string {
  return `Сегодня агент уже отработал: ${picks} статей в ${timeUtc} UTC. Запускаю ещё раз.`;
}

// Task 37 §4: shown when /publish hits PUBLISH_MAX_PER_DAY — the cap is a
// flood guard, not an inconvenience, so there's no force-bypass wording here
// (unlike agentAlreadyRanWarning above, which precedes a run that still
// happens).
export function publishCapReachedText(maxPerDay: number): string {
  return `Дневной лимит публикаций достигнут (${maxPerDay}).`;
}
