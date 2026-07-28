# Chrome Web Store listing — copy to paste into the Developer Dashboard

This file exists so the store listing text lives in version control next to the code it describes,
instead of only inside the Dashboard. Paste each section into its matching Dashboard field. None of
this is fetched or read by the extension itself.

## Short description (≤132 chars — Store field: "Summary")

```
Save any page or a text selection to your own ClipFeed instance for AI summarization. BYO backend.
```

(99 characters — matches `manifest.json`'s own `description`, which Chrome enforces the 132-char cap
on independently.)

## Detailed description (Store field: "Description")

```
ClipFeed is a self-hosted read-it-later feed with AI-generated summaries. This extension is the
one-click "save" companion for it — it sends the current tab (or just your text selection) to your
own ClipFeed server, which extracts the article, summarizes it, and adds it to your feed.

IMPORTANT — this is a BYO-backend tool, not a hosted service:
This extension does nothing on its own. It only works once you've deployed your own ClipFeed
instance (a small open-source Cloudflare Worker — see https://github.com/you/clipfeed, or wherever
you forked it from) and
entered that instance's URL plus a Cloudflare Access Service Token in the extension's Settings page.
There is no ClipFeed company server this extension talks to, and no account to sign up for here —
you are the operator of the only server it will ever contact.

What it does:
- Toolbar popup: "Save page" sends the current tab's title, URL, and rendered HTML to your server.
  "Save selected text" does the same but scoped to whatever text you've highlighted.
- Optional tags: add comma-separated tags before saving.
- Undo: remove a just-saved article with one click if you change your mind.
- Settings page: point the extension at your server's URL and paste in your Access Service Token's
  Client ID/Secret — the extension verifies the connection before saving anything.

What it does NOT do:
- No background scraping, no periodic sync, no reading of pages you haven't explicitly saved.
- No analytics, no crash reporting, no third-party network calls of any kind — see the privacy
  section below for exactly what leaves your browser and where it goes.
- No ads, no data resale — this is a personal tool for people running their own ClipFeed fork.

Setup requires deploying the ClipFeed Worker to your own Cloudflare account (free tier is enough)
and configuring Cloudflare Access for authentication. Full instructions are in the project's README.
```

## Privacy practices (Store's mandatory privacy questionnaire)

Chrome Web Store requires every listing to declare what user data is collected and why, matched to
the extension's actual behavior — reviewers check this against a permissions/network audit, so it's
written here directly from the source (`packages/extension/src/`), not from memory.

**What data is collected, and when:** The extension only ever transmits data in response to a direct
user action (clicking "Save page", "Save selected text", "Undo", or "Save" on the Settings form) —
never automatically, never on a timer, never just from opening a tab or the popup.

- **Save page / Save selection**: the current tab's URL, title, and (if capture succeeds) the page's
  rendered HTML — or, for a selection save, just the selected text's HTML fragment — plus any tags
  you typed. See `packages/extension/src/content/content-page.ts` and `content-selection.ts` for the
  exact capture logic (Readability-based extraction, HTML only, no cookies/local storage/browsing
  history of the page are read or sent).
- **Settings save**: the server URL and Access Service Token Client ID/Secret you type in, used to
  verify connectivity (`GET /api/health`, `GET /api/admin/me`) before being stored.
- **Undo**: only the article ID of the row just created.

**Where it goes:** Every network request the extension makes goes to exactly one place: **the server
URL you typed into the extension's own Settings page** (`packages/extension/src/lib/config.ts`'s
`serverOrigin`, stored in `chrome.storage.local`). Confirmed by grepping every `fetch(...)` call
site in `packages/extension/src/` (`background.ts` lines 58/169, `options.tsx` lines 51/58) — all
four use `config.serverOrigin`/`origin`, none hardcode any host. The extension requests
`optional_host_permissions` for that one origin at Settings-save time via
`chrome.permissions.request` (never `<all_urls>` at install time) — see the manifest audit below.

**What is NOT collected or sent:**

- No analytics, telemetry, or crash-reporting SDK of any kind (grepped: no `analytics`, `gtag`,
  `sentry`, `posthog`, or any third-party script in the codebase).
- No data is sent to the extension author, to Google, or to any server other than the one you
  configured.
- Credentials (Client ID/Secret) are stored in `chrome.storage.local` (this browser profile only,
  never `chrome.storage.sync`) and are sent ONLY as request headers to your own configured server —
  never logged, never sent anywhere else.
- No third-party libraries phone home: the only bundled dependency touching page content is
  `@mozilla/readability` (pure client-side HTML parsing, no network calls of its own).

**Permission justification** (every permission declared in `manifest.json`, and why it's needed):

- `activeTab` — read the current tab's URL/title/content only after the user clicks the toolbar icon
  or a Save button (a user gesture), never in the background.
- `scripting` — inject the (bundled, first-party) content-capture script into the active tab on
  demand; no static `content_scripts` entry, so no code runs on pages the user hasn't acted on.
- `storage` — persist the server URL and Access credentials locally.
- `optional_host_permissions` (`https://*/*`, `http://*/*`) — requested, not granted upfront; the
  actual runtime grant is scoped to the single origin the user enters in Settings.

## Screenshots (1280×800 or 640×400 — Store requires at least one, up to 5)

The agent cannot produce real browser screenshots — capture these manually before submitting:

1. **The popup in its "ready" state** on a real article page — shows the domain/title, the tags
   input, and the "Save page" / "or save selected text" buttons. This is the single most important
   shot; it's what most users will see first in the listing.
2. **The Settings (options) page** with the Server URL field visible (blank or with a placeholder
   like `https://clipfeed.example.com`, not your real instance's URL) — demonstrates the BYO-backend
   model at a glance.
3. **A successful save** — the popup's green "Saved — summary in ~10s" card with "Open feed" /
   "Undo" visible.

Optional 4th/5th shots: the ClipFeed feed itself (a saved article's summary card), or the permission
prompt Chrome shows when granting the server origin.

**Before uploading any screenshot, redact/avoid showing:** your real server URL/domain, your Access
Service Token values, and any personal article content you don't want public — screenshots are
public once the listing is published.

## Single purpose statement

Chrome Web Store requires a one-sentence "single purpose" declaration for every extension:

```
Capture the current tab (or a text selection) and send it to a user-configured ClipFeed server for
AI-powered summarization and archival.
```
