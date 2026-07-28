import type { ArticleStatus } from "@clipfeed/shared/types";

// Task 55: a duplicate-add 409 used to just say "Already saved" — a dead
// end if the existing article is archived or failed processing entirely,
// since the popup gives no hint of where to look. Matches the wording the
// SPA's own duplicate-reveal toast uses (see App.tsx), so a user sees the
// same phrase whether they hit the duplicate from the extension or the web
// app. Archived takes priority over status, same as the API/Telegram side
// (see telegram-strings.ts's alreadySavedText) — a healing-job auto-archive
// can archive a failed row too.
export function duplicateSavedLabel(status: ArticleStatus, archived: boolean): string {
  if (archived) return "This article is archived";
  if (status === "failed") return "This article failed — you can retry";
  return "Already in your feed";
}
