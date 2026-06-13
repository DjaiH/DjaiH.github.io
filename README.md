# Mini Game Hub

Offline idle games (Cookie Clicker, Idle Dungeon, and Orbital Defense) in one web app. Plays in any mobile browser, installs to the home screen, and works offline. Progress saves automatically in the browser.

## Project layout

It's a static, buildless site — plain `<script>` tags, no bundler, no dependencies:

- `index.html` — markup + script/style links
- `css/styles.css` — shared styles
- `js/core.js` — shared engine (number formatting, save system, router, modal/toast, ticker, achievements, settings)
- `js/game-clicker.js`, `js/game-dungeon.js`, `js/game-defense.js` — one module per game
- `js/sw-register.js` — service-worker registration
- `sw.js` — offline cache (bump `CACHE` when files change)

Each game is a self-contained IIFE that registers itself with the shared `Router`. To add a game, drop a new `js/game-*.js`, add a `<script>` tag and a menu card in `index.html`, add it to the games list in `js/core.js`, and add the file to `sw.js`.

## Play it on your phone via GitHub Pages

1. Go to https://github.com and sign in (create a free account if needed).
2. Click **New repository**. Name it e.g. `game-hub`, set it **Public**, click **Create repository**.
3. On the new repo page click **Add file → Upload files**, then drag in these files from this folder:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon.svg`
   Click **Commit changes**.
4. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose **Deploy from a branch**. Pick branch **main** and folder **/ (root)**. Click **Save**.
5. Wait ~1 minute, then refresh. Pages shows your live URL, like:
   `https://YOURNAME.github.io/game-hub/`
6. Open that URL on your phone in **Chrome (Android)** or **Safari (iOS)**.

### Make it feel like an app
- **Android/Chrome:** tap the **⋮** menu → **Add to Home screen** (or **Install app**).
- **iOS/Safari:** tap **Share** → **Add to Home Screen**.

It then launches full-screen with no browser bar, and works with no internet connection.

## Why this fixes the APK problems
Hosting on Pages and playing in a real browser removes the AppsGeyser wrapper, so:
- **No ads** (those came from AppsGeyser's free tier).
- **Emoji render correctly** (the APK WebView had no emoji font → question marks).
- **Correct dark background and progress bars** (real browsers render the CSS properly).

## Saving progress
- Progress is stored in the browser's `localStorage` and **persists after you close the tab** — it is only lost if you clear the site's data or use private/incognito mode.
- For a backup (e.g. switching phones), use **Save / Load → Export** in the app to copy a save code, and **Import** to restore it.

## Updating the game later
Re-upload a changed `index.html`, and bump the `CACHE` name in `sw.js` (e.g. `-v2` → `-v3`) so installed copies fetch the new version.

## Note on AppsGeyser
`index.html` still works as a standalone single file if you ever package it again — the manifest/service-worker just add the installable/offline niceties on a real host and are safely ignored otherwise.
