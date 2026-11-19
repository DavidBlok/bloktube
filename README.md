# BlokTube

A desktop music player that looks and works like Spotify, using YouTube Music for playback.

The YouTube Music website runs in a hidden window that does the actual playing. BlokTube's own interface sits on top: library sidebar, home, search, album/playlist/artist pages, queue, synced lyrics and a Spotify-style player bar.

## Getting started

```bash
npm install
npm run dev
```

The first launch opens as a guest. Click **Sign in** (top right or in the sidebar) to log in with your Google account. The YouTube Music sign-in page opens in its own window and closes by itself when you're done. Your session is stored in the app's own profile, separate from your browser.

YouTube Music Premium is recommended: no ads, and background play works without interruptions.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run build` | Production build into `out/` |
| `npm run preview` | Run the production build |
| `npm test` | Parser tests against captured YouTube Music responses |
| `npm run typecheck` | TypeScript checks for main, preload and renderer |
| `npm run dist:mac` | macOS installers (`.dmg` for Apple Silicon and Intel) into `dist/` |
| `npm run dist:win` | Windows installer (`.exe`, x64) into `dist/` |
| `npm run dist:linux` | Linux `.AppImage` (x64) into `dist/` |
| `npm run dist:all` | All of the above. Works from a Mac; Windows and Linux builds can also be made on those systems |

## Installing

The installers aren't code-signed, so each system asks for confirmation the first time.

**macOS**: open `BlokTube-<version>-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg` (Intel) and drag BlokTube into Applications. If you copied the `.dmg` from another computer, macOS blocks the first launch: open **System Settings → Privacy & Security** and click **Open Anyway**, or run `xattr -cr /Applications/BlokTube.app`.

**Windows**: run `BlokTube-Setup-<version>-win-x64.exe`. It installs for your user only (no admin rights) and adds Start menu and desktop shortcuts. If SmartScreen says "Windows protected your PC", click **More info → Run anyway**. Uninstall from **Settings → Apps**.

**Linux**: make the AppImage executable and run it (`chmod +x BlokTube-<version>-linux-x86_64.AppImage`).

## Features

- Library sidebar with playlists, albums, podcasts, artists, Liked Songs and downloads
- Home, search, album/playlist/artist/podcast pages, Recently played, Your uploads
- Your own playlists: create, rename, delete, public/unlisted/private, drag songs to reorder or onto a playlist in the sidebar, select several songs with ⇧/⌘-click
- Queue, synced lyrics, now playing panel, sleep timer (moon button), mini player
- Downloads and offline playback (Premium)
- Settings: audio quality and other YouTube Music options, autoplay, fade between songs, accent colour, menu bar / tray icon, open at login

## Keyboard shortcuts

Use ⌘ on macOS and Ctrl on Windows and Linux.

| Keys | Action |
| --- | --- |
| Space | Play / pause |
| ⌘ → / ⌘ ← | Next / previous |
| ⇧ → / ⇧ ← | Seek ±5 s |
| ⌘ ↑ / ⌘ ↓ | Volume |
| ⌘ S / ⌘ R | Shuffle / repeat |
| ⌘ K or ⌘ L | Search |
| ⌘ [ / ⌘ ] | Back / forward |
| ⌘ ⇧ M | Mini player |
| Esc | Clear song selection |

## How it works

```
┌────────────── Main process ──────────────┐
│ Engine (hidden BrowserWindow)            │  music.youtube.com + injected bridge
│ Ytm (fetch + parse InnerTube responses)  │  src/main/ytm.ts, src/shared/ytm/parse.ts
│ Lyrics (LRCLIB, falls back to YouTube)   │  src/main/lyrics.ts
└────────────────▲─────────────────────────┘
                 │ IPC (window.blok)
┌────────────────┴─────────────────────────┐
│ Renderer: React + zustand UI             │  src/renderer
└──────────────────────────────────────────┘
```

- **Engine** (`src/main/engine.ts`): loads YouTube Music in a hidden window with its own persistent session, and injects `src/engine/bridge.js`. Sign-in and consent pages are shown to you when needed.
- **Bridge** (`src/engine/bridge.js`): runs inside the YouTube Music page. It uses the page's own `networkManager` for authenticated API calls, plays music through the app's own navigation, and controls YouTube Music's own queue. It streams player and queue state back to the app.
- **Parsing** (`src/shared/ytm/parse.ts`): turns InnerTube JSON into simple `Track`, `Card`, `Shelf`, `CollectionPage` and `ArtistPage` objects. Tests in `test/` run against real captured responses in `test/fixtures/`.
- **UI** (`src/renderer`): Spotify-style layout. Colours come from the artwork, and synced lyrics come from [LRCLIB](https://lrclib.net).

Use **View → Show YouTube Music Window** to see the hidden engine, and **View → YouTube Music DevTools** to debug it.

## Notes

- This is a personal project that drives the YouTube Music website. It can break when YouTube changes its web app. The bridge and parser are the places to look when that happens.
- With YouTube Music Premium you can download albums, playlists and songs (the ↓ button, or right-click → Download) and play them offline from **Downloads**. Downloads stay available as long as the app goes online at least once every 30 days.
