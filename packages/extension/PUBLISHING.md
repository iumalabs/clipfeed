# Publishing to the Chrome Web Store

Manual, owner-only steps to submit (or update) the ClipFeed extension on the Chrome Web Store.
Everything automatable — build, zip, listing copy — is already done by `deno task package:extension`
and `STORE_LISTING.md`; this document covers what's left, which only a human with a Google account
and a credit card can do.

## One-time steps (first submission only)

1. **Register a Chrome Web Store developer account.** Go to the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in
   with the Google account you want to publish under. Pay the one-time $5 registration fee if you
   haven't registered before (this is per Google account, not per extension — skip if you've
   published anything before).

2. **Build and zip the extension.**
   ```
   deno task package:extension
   ```
   This produces `dist/extension.zip`. Confirm the manifest version inside it is what you intend to
   publish (`unzip -p dist/extension.zip manifest.json | grep version`).

3. **Create a new item in the Dashboard.** Click "New Item" and upload `dist/extension.zip`.

4. **Paste the listing copy from `STORE_LISTING.md`.**
   - "Summary" field ← the short description
   - "Description" field ← the detailed description
   - "Single purpose" field ← the single purpose statement
   - Fill in the privacy questionnaire using the "Privacy practices" section of that file as your
     answer key (what's collected, where it goes, no analytics/third parties).
   - Category: something like "Productivity".

5. **Upload screenshots.** Capture the shots listed in `STORE_LISTING.md`'s "Screenshots" section
   (1280×800 or 640×400) and upload at least one. Redact any real server URL, token, or personal
   article content first.

6. **Set visibility.** Choose **Unlisted** or **Public** under the item's "Visibility" settings:
   - **Unlisted** — the item only opens for people who have the direct Dashboard listing link; it
     never appears in Chrome Web Store search results. Good default for a personal/BYO-backend tool
     like this one, since it's meant for people who are already deploying their own ClipFeed
     backend, not for organic discovery.
   - **Public** — listed and searchable by anyone. Pick this only if you want strangers finding and
     installing it (they'd still need their own ClipFeed backend to get any use out of it).

7. **Submit for review.** Click "Submit for review". Google's typical review turnaround is a few
   hours to a few days for a new item (can occasionally take longer, especially for the first
   submission from a new developer account). You'll get an email when it's approved, rejected, or
   needs changes.

## Per-update steps (every subsequent release)

1. **Bump the version** in `packages/extension/manifest.json`. The Chrome Web Store requires every
   upload to have a strictly higher version number than the last **approved** upload for that item —
   re-uploading the same or a lower version is rejected outright. Semver (`MAJOR.MINOR.PATCH`) is
   fine; only the ordering matters to the Store, not the scheme.

2. **Rebuild and rezip.**
   ```
   deno task package:extension
   ```

3. **Upload the new `dist/extension.zip`** as a new package version on the existing Dashboard item
   ("Package" tab → upload new package).

4. **Update listing copy if it changed** (re-paste from `STORE_LISTING.md` if you edited it).

5. **Submit for review** again. Updates to an already-approved item are usually reviewed faster than
   a first submission, but there's no guarantee.

Visibility, category, and privacy questionnaire answers persist across updates — you only need to
touch them again if they've actually changed.

## Optional: CI-built zip

Pushing a tag matching `extension-v*` (e.g. `extension-v0.3.0`) triggers
`.github/workflows/release-extension.yml`, which runs `deno task package:extension` and attaches the
resulting `dist/extension.zip` to a GitHub Release. This is just a convenience for downloading a
known-good zip without a local Deno install — you still need to do the Dashboard upload yourself.
