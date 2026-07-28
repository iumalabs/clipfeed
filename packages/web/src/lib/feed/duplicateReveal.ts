import type { ArticleStatus } from "@clipfeed/shared/types";
import { ApiError } from "../api/api.ts";

export interface DuplicateInfo {
  id: string;
  status: ArticleStatus;
  archived: boolean;
}

// Task 55: a duplicate 409 (POST /api/admin/articles, either the exact-URL
// or similar-title reason) used to be a dead end — a bare error toast even
// though the server always knows exactly which article it duplicates. This
// pulls that article's id/status/archived out of the caught ApiError so
// App.tsx's handleAdd can reveal it (deep-link + state-aware toast)
// instead. Returns null for anything that isn't that specific 409 shape.
export function extractDuplicateInfo(err: unknown): DuplicateInfo | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as
    | { error?: string; id?: string; status?: ArticleStatus; archived?: boolean }
    | undefined;
  if (body?.error !== "duplicate" || !body.id) return null;
  return { id: body.id, status: body.status ?? "ready", archived: body.archived ?? false };
}

export type DuplicateState = "ready" | "archived" | "failed";

// Archived takes priority over status — an archived row can be in any
// status (the healing job auto-archives a failed row once its heal-attempt
// cap is exhausted, see classifyAndMaybeArchive in packages/api/src/articles/db.ts),
// and either way "archived" is the more useful thing to tell the user.
export function classifyDuplicateState(
  info: Pick<DuplicateInfo, "status" | "archived">,
): DuplicateState {
  if (info.archived) return "archived";
  if (info.status === "failed") return "failed";
  return "ready";
}

export interface DuplicateRevealDict {
  duplicateRevealReadyToast: string;
  duplicateRevealArchivedToast: string;
  duplicateRevealFailedToast: string;
}

export function duplicateRevealMessage(
  dict: DuplicateRevealDict,
  state: DuplicateState,
): string {
  switch (state) {
    case "ready":
      return dict.duplicateRevealReadyToast;
    case "archived":
      return dict.duplicateRevealArchivedToast;
    case "failed":
      return dict.duplicateRevealFailedToast;
  }
}
