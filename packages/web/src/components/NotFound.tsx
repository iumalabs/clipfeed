import type { Dictionary } from "../i18n/i18n.ts";

export interface NotFoundProps {
  dict: Dictionary;
  onBackToFeed: () => void;
}

// Rendered instead of the normal Feed when the loaded pathname isn't one the
// SPA recognizes (see lib/feed/deepLink.ts's isUnknownPath) — e.g. "/a/" with
// no id, or any other unrelated path. wrangler.toml's [assets]
// not_found_handling still serves this same SPA shell for such a path (so the
// URL bar keeps showing it, no server round-trip needed), but without this
// component the app silently fell back to rendering the ordinary feed with no
// indication the URL itself was wrong.
export function NotFound(props: NotFoundProps) {
  return (
    <div class="empty-state">
      <p class="empty-state-title">{props.dict.notFoundTitle}</p>
      <p class="empty-state-hint">{props.dict.notFoundHint}</p>
      <button type="button" class="empty-state-reset" onClick={props.onBackToFeed}>
        {props.dict.backToFeedLink}
      </button>
    </div>
  );
}
