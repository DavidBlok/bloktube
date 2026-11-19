# BlokTube

Personal Electron app: a Spotify-style desktop client for YouTube Music. The real YouTube Music website runs in a hidden window as the playback engine; the app's own React UI sits on top. Primary target is macOS (Apple Silicon).

## Working agreements

- Never commit code or create commits. David handles git himself (no repo initialised yet).
- Keep code comments to a minimum.
- Run `npm run typecheck` and `npm test` after changes; `npm run build` for anything touching main/preload/config.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install (downloads the Electron binary) |
| `npm run dev` | Run with hot reload |
| `npm test` | Parser tests against `test/fixtures/*.json` |
| `npm run typecheck` | TS checks for node (main/preload/shared) and web (renderer) |
| `npm run build` / `npm run preview` | Production build into `out/` / run it |
| `npm run dist:mac` / `dist:win` / `dist:linux` / `dist:all` | Installers into `dist/`: `.dmg` (arm64 + x64), NSIS `.exe` (x64), `.AppImage` (x64). All three build from a Mac |
| `scripts/fetch-fixture.sh <endpoint> '<body>' <name>` | Capture a fresh InnerTube response into `test/fixtures/` |
| `scripts/make-icon.sh` | Regenerate `build/icon.png` + `build/icon.icns` from `build/icon.svg` (stacked-blocks play logo) |

## Architecture

```
Renderer (React + TanStack Query + zustand)  ──window.blok──▶  preload/index.ts  ──IPC──▶  main/index.ts
                                                                            │
                                     main/ytm.ts (calls + parse) ◀──────────┤
                                     main/lyrics.ts (LRCLIB)                │
                                     main/color.ts (artwork colour)         │
                                                                            ▼
                         main/engine.ts: hidden BrowserWindow on music.youtube.com
                                    │ executeJavaScript(window.__blok.*)
                                    ▼
                         engine/bridge.js (injected, runs in the YT Music page)
                                    │ postMessage → preload/engine.ts → IPC 'engine:event'
                                    ▼
                         player / queue / ready events back to main → renderer
```

### Key files

| Path | Role |
| --- | --- |
| `src/main/engine.ts` | Hidden YT Music window, session `persist:ytm`, UA fix, consent cookie, sign-in flow, `call()`/`fetch()` into the bridge |
| `src/engine/bridge.js` | Plain JS, imported with `?raw` and injected on `did-finish-load`. Must stay self-contained. Exposes `window.__blok` |
| `src/main/ytm.ts` | High-level API used by IPC handlers (home, browse, search, collection, artist, library incl. followed podcasts, lyrics, rate, save, subscribe, create/add to/remove from/move in/edit/delete playlist, history, uploads, YT Music settings) |
| `src/main/settings.ts` | App settings in `userData/settings.json` (tray, close to tray, accent, fade seconds), sanitised on read and write |
| `src/main/system.ts` | Dock menu (macOS), tray / menu-bar icon with a playback menu, Windows taskbar buttons. Icons in `resources/`, rendered from `resources/src/*.svg` by `scripts/make-ui-icons.sh` |
| `src/shared/ytm/parse.ts` | InnerTube JSON → `Track`, `Card`, `Shelf`, `CollectionPage`, `ArtistPage`, `SearchResults` |
| `src/shared/types.ts` | Shared types incl. the `BlokApi` contract exposed as `window.blok` |
| `src/preload/index.ts` | `window.blok` API for the UI |
| `src/preload/engine.ts` | Relays bridge `postMessage` events to main |
| `src/renderer/src/lib/query.ts` | TanStack `queryClient`, all query options (`queries.home()`, `.collection(id)`, `.artist(id)`, `.search(q, filter)`, `.library()`, `.history()`, `.uploads()`, `.ytmSettings()`, `.lyrics()`, `.color()` …) and track-like cache helpers |
| `src/renderer/src/lib/mutations.tsx` | `rateTrack` (optimistic across all cached track lists, rollback on error), `useSaveCollection`, `useFollowArtist`, playlist management (`createPlaylist` "My Playlist #N", `addToPlaylist` with the "Already added" dialog, `removeFromPlaylist` (one or many), `movePlaylistItems` (optimistic reorder), `setPlaylistPrivacy`, `useEditPlaylist`, `confirmDeletePlaylist`), `removeFromHistory` |
| `src/renderer/src/lib/actions.tsx` | Track, multi-selection (`tracksMenu`) and card context menus (incl. the "Add to playlist" submenu built from the cached library's `editable` playlists) |
| `src/renderer/src/lib/drag.ts` | In-memory state of the current song drag (track rows → reorder in own playlists, or drop on sidebar playlists / Liked Songs) |
| `src/renderer/src/lib/appSettings.ts` | App settings store, accent swatches, applies `--accent` / `--accent-hover` |
| `src/renderer/src/lib/downloads.tsx` | Download actions (`startDownload`, `confirmRemoveDownload`) and hooks (`useTrackDownload`, `usePlaylistDownload`) |
| `src/renderer/src/lib/offline.ts` | `useOnline()`, `offlineRoute()` (which play target works offline), `localCollection()` / `downloadedLibrary()` (pages and sidebar items built from download state) |
| `src/renderer/src/store/player.ts` | Player/queue/auth/downloads/sleep-timer state (zustand), fed by main's events; syncs player-bar like changes into the query cache |
| `src/renderer/src/store/nav.ts` | Route stack (home, search, collection, artist, browse, lyrics, downloads, history, settings, uploads) with back/forward |
| `src/renderer/src/store/ui.ts` | Right panel, context menu (items can have a `submenu`), dialog (`confirm` / `editPlaylist`), toast, sticky header |
| `src/renderer/src/views/*` | Home, Search (+ Browse all moods), Collection (album/playlist/podcast show), Artist, Browse (generic shelves), Lyrics, Downloads (built only from local download state), History (Recently played), Settings, Uploads |
| `src/renderer/src/components/*` | Sidebar, TopBar (with logo), PlayerBar, RightPanel (now playing / queue), TrackList, Cards, Slider, Overlays (context menu with submenus, dialogs, splash, auth banner), Logo (block mark, animated on the splash), Download (collection download button, row/sidebar status glyph), Offline (offline banner, `OfflineState`, `Pending`), MiniPlayer (rendered instead of `App` when the page hash is `#mini`) |
| `src/renderer/src/styles.css` | All styling. Accent colour is `--accent` |

### How playback works

- Play: renderer → `player:play` → bridge `play(target)` dispatches a `yt-navigate` event with a `watchEndpoint`/`watchPlaylistEndpoint` on `ytmusic-app`. YouTube Music itself owns playback and the queue.
- State: bridge watches the `<video>` element and the queue store, posts `player` and `queue` snapshots (deduped) → main → renderer (`player:state`, `queue:changed`).
- Queue ops use YT Music's own queue store (`#queue.dispatch` with `SET_INDEX`, `REMOVE_ITEM`, `MOVE_ITEM`, `ADD_ITEMS` via `/music/get_queue`). This mirrors Pear Desktop's `src/renderer.ts`.
- API calls go through `ytmusic-app.networkManager.fetch(path, body)`, which handles auth, visitor data and client context. Errors are converted to `Error(message)` in the bridge.

### How downloads work

- YouTube Music's own Premium web downloads (`offline.js`) do the work inside the engine: audio (Opus ~270 kbps) goes into IndexedDB `yt-player-local-media`, with a 30-day `offlineVideoPolicy`. The engine window only has to stay open (hidden is fine).
- Trigger: the bridge creates a hidden `ytmusic-menu-service-item-download-renderer` with an `offlineVideoEndpoint` (song) or `offlinePlaylistEndpoint` (album/playlist incl. `LM`) and clicks it, exactly like YT Music's own "Download" menu item. Dispatching the endpoint as a `yt-service-request` does nothing.
- Remove: clicking the same element on a downloaded item opens YT Music's `yt-confirm-dialog-renderer`; its confirm button sends a `CLIENT_SIGNAL` `DELETE_DOWNLOAD` that only the opening element handles, so keep the element attached until the dialog is confirmed.
- State: read from the YT Music store's `entities` (`musicDownloadsLibraryEntity.downloadedTracks/downloadedPlaylists`, `musicTrack`, `musicTrackDownloadMetadataEntity` → `downloadStatusEntity`, `playbackData` → `transfer` → `offlineVideoStreams` bytes, `musicPlaylist`, `musicPlaylistDownloadMetadataEntity`). Entity keys are URL-encoded base64 protobuf with the video/playlist id at byte 2 (length at byte 1). The bridge posts deduped `downloads` snapshots (`downloads:changed`).
- Offline (tested 18 Nov 2026 with CDP network emulation on the page and the `sw.js` service worker): YT Music's service worker serves the app shell, so the engine loads offline from `/` (the startup URL) with the bridge, cached library guide and download state intact. Reloading another path offline (e.g. `/browse/FEmusic_offline`) fails with `chrome-error://`.
- Offline playback depends on the play target. A normal `{ videoId }` play of a downloaded song fails ("An error occurred"). Downloaded albums/playlists play offline via their own `playlistId` (optionally with `videoId`), with the full queue. Individually downloaded songs play via `{ videoId, playlistId: 'PPSV' }` (`PPSV` = YT Music's "Downloaded songs" auto playlist), but only as a single track. `{ playlistId: 'PPSV' }` alone queued the downloads once on a warm page but loaded nothing after a cold offline start.
- Offline mode: `usePlayer.play()` checks `navigator.onLine` and rewrites the target with `offlineRoute()` (downloaded playlist → as is; track inside a downloaded playlist → `{ videoId, playlistId }` of that playlist; individual download → `playLocal`; anything else → toast, no play). Bridge `playLocal(videoIds)` plays the first song via `PPSV`, clears the rest of the queue and appends locally built `playlistPanelVideoRenderer` items whose `watchEndpoint` is `{ videoId, playlistId: 'PPSV' }`, so next/previous work with no network. `PPSV` only holds individual downloads: if the first song isn't one, the queue has no selected item, so `playLocal` dispatches `SET_INDEX 0`. The Downloads view always plays through `playLocal`. Starting offline with downloads opens the Downloads view (`OfflineBanner`).

### Desktop extras

- Mini player: a 360×112 frameless always-on-top window (`toggleMini()` in main) loading the renderer with `#mini`. Both windows get every broadcast (`send()`), and each runs its own `initPlayerBindings()` / `initAppSettings()`.
- Sleep timer lives in main (renderer timers get throttled when hidden). Minutes → `setTimeout` → bridge `pause`. "End of track" remembers the current `videoId`; when another track starts, main waits until it reports playing and then pauses it (pausing while it was still loading left YT stuck in "buffering" with a paused video). Repeat-one is detected as the position wrapping to 0.
- Fade between songs: a Web Audio `GainNode` on the `<video>` (`createMediaElementSource`), driven by the player's `getCurrentTime()` / `getDuration()`. Don't use the element's `currentTime` / `duration`: YT appends the next track to the same MediaSource, so element time includes the previous track.
- Tray: macOS uses `trayTemplate.png` (template image) in the menu bar; Windows/Linux `tray.png`. "Close to tray" (Windows/Linux) hides instead of closing; on macOS closing the window always hides it.
- Podcasts: shows (`MPSP<playlistId>`) parse as collections (`kind: 'podcast'`) whose rows are `musicMultiRowListItemRenderer` episodes (`Track.episode` with description/date/progress; durations like "1 hr 5 min"). They play with `{ videoId, playlistId }` like a playlist. The player reports the show (`MPSP…`) as the artist, so `openArtist()` routes `MPSP` ids to the collection view. Followed shows come from `FEmusic_library_non_music_audio_list` (keep `kind === 'podcast'`; the list also holds "New Episodes" `VLRDPN` and "Episodes for Later" `VLSE`).
- Uploads: `FEmusic_library_privately_owned_tracks` (song rows) and `_releases` (album grid). Uploading isn't implemented; the Upload button opens music.youtube.com in the browser. Bridge `playList(videoIds)` plays exactly the given songs (first via `watchEndpoint`, removes the radio, adds the rest through `/music/get_queue`).
- Multi-select: Shift/⌘/Ctrl-click in `TrackList`; right-clicking a selected row opens `tracksMenu`. Drag reorder only in own playlists (`variant === 'playlist'`); dropping past the last loaded row of a partially loaded playlist is refused because the server would move the songs to the very end.

## Gotchas

- electron-vite 6 + Vite 8: use `build.rolldownOptions` (not `rollupOptions`). Preload has two entries (`index`, `engine`).
- Don't add `"type": "module"` to package.json: sandboxed preloads must be CommonJS.
- The renderer CSP is `script-src 'self'`; a dev-only plugin in `electron.vite.config.ts` adds `'unsafe-inline'` so React Fast Refresh's inline preamble works.
- EU consent: the engine sets `SOCS=CAI` (reject non-essential) before loading. If a consent or Google sign-in page still appears, the engine window is revealed and hidden again on `ready`.
- Keep the engine session's default Electron user agent. Stripping `Electron/…` to look like plain Chrome makes Google reject sign-in ("This browser or app may not be secure"); Pear Desktop also ships the unmodified UA by default.
- Google passkeys stored in 1Password can't be used in the engine window (no browser extension, and hybrid/phone needs Bluetooth). Sign in via "Try another way" → password.
- Google's artwork hosts return `429 text/html` (surfacing as `net::ERR_BLOCKED_BY_ORB`) when a `http://localhost` Referer is sent. `main/index.ts` strips the Referer for artwork URLs on the default session. A `<meta name="referrer">` or `Referrer-Policy` header doesn't cover CSS `background-image` requests.
- YT Music's volume slider is perceptual: store `player.volume` / `bar.volume` is the slider value, `getVolume()` is the curved one. The bridge reports the slider value.
- Likes, saves and follows apply immediately, but `FEmusic_liked_*` / `VLLM` / `FEmusic_library_corpus_artists` lag by a few seconds, and an artist page header's `subscribed` flag can lag 10+ minutes. `Ytm` (main) covers this: saves/follows are kept as pending overrides for 5 minutes (applied to `library()`, `collection().saved`, `artist().subscribed`), and the artist page's `subscribed` comes from the library artist list (`FEmusic_library_corpus_artists` = subscriptions) when it's complete. The artist list is keyed by artist browse id, which differs from the `channelId` used to subscribe. Likes work the same way: `rate()` (with the track) and `noteToggleLike()` (player bar, from the last player state) record pending likes that add/remove songs in `VLLM` (first page and its continuations) and patch `likeStatus` in collection, artist and search track lists.
- Renderer state split: server data (pages, library, lyrics, artwork colours) lives in TanStack Query; pushed engine state (player, queue, auth) and UI state live in zustand. Home, collections and filtered search are `useInfiniteQuery` with a `select` that merges pages; a collection's first page stores its header in `page` and tracks separately. Never patch query data per view: like status goes through `setTrackLike()`, which updates every cached `collection`/`artist`/`search` list. On sign-in/sign-out all queries are invalidated and `library` is removed. Queries use TanStack's default `networkMode: 'online'`: offline they pause (keeping cached data) and resume on reconnect, so views render `<Pending paused={q.fetchStatus === 'paused'} />` instead of a bare spinner; mutations use `'always'`. Offline, `CollectionView` falls back to `localCollection()` for downloaded albums/playlists, and the sidebar falls back to `downloadedLibrary()`.
- Playlists: own playlists are recognised by a `playlistEditorEndpoint` in a library card's menu (`Card.editable`) and by a `musicEditablePlaylistDetailHeaderRenderer` header (`CollectionPage.editable`); own pages hide the save toggle. Edits to a playlist's contents and name show up immediately, but a brand-new playlist's page has no header for a moment, and the library lags a few seconds after create/delete. `Ytm` covers both: created playlists get their title/editable patched in for 5 minutes and are added to `library()` as pending items; deleted ones are removed. Adding a duplicate returns `status: STATUS_FAILED` (not an error) with an "Add anyway" command that uses `dedupeOption: DEDUPE_OPTION_SKIP`. New playlists are created `PRIVATE`.
- Continuations: body-style `{ continuation: token }` works for home, playlists and search as long as the context includes `visitorData` (networkManager adds it).
- Unfiltered search now returns a flat list of `itemSectionRenderer`s (no "Songs"/"Albums" shelves). `parseSearch` groups them by type; top songs = card tracks topped up to 4.
- Packaging (`electron-builder.yml`): mac uses ad-hoc signing (`identity: '-'`) with `hardenedRuntime: false` (hardened runtime + ad-hoc can break launch; there's no notarization anyway). Windows is an unsigned per-user one-click NSIS installer. Linux ships only an AppImage: a `.deb` needs a `homepage`/`repository` URL in package.json. The dev app and the packaged app share the same userData (`persist:ytm` sign-in) and single-instance lock, so quit one before starting the other. Never run `asar extract-file` from the project root: it writes `package.json` into the current directory and overwrites the real one.
- Requests from datacenter IPs get restricted responses (no songs/albums, moods 404, playback "Video unavailable"). Capture fixtures from a home network.
- The bridge depends on YT Music internals: `ytmusic-app.networkManager`, `#queue.queue.store.store`, `ytmusic-player-bar.updateVolume` / `onRepeatButtonClick` / `.queue.shuffle`, `#like-button-renderer`, `.next-button` / `.previous-button`. When YouTube changes its web app, look here first; Pear Desktop (github.com/pear-devs/pear-desktop) is the best reference.

## Testing and debugging

- `test/parse.test.ts` covers home, continuation, search (all + filters), suggestions, album, playlist (+ long playlist continuation, own-playlist `editable` and `privacy` detection with synthetic responses since fixtures are captured signed-out), podcast show + episodes, artist, moods, lyrics, explore, YT Music settings (`settings.json` was captured signed-in and anonymised; keep personal data out of fixtures).
- `test/fixtures/home_cont_body.json` and `home_cont_legacy.json` are empty guest responses from an early experiment; unused and safe to delete.
- In the app: **View → Show YouTube Music Window** and **View → YouTube Music DevTools**. In the engine console, `window.__blok.state()` and `window.__blok.queue()` show what the bridge sees.
- Headless checks: launch with `--remote-debugging-port=9222`, then use the Chrome DevTools Protocol (`http://127.0.0.1:9222/json`) to evaluate `window.blok.*` in the UI page or `window.__blok.*` in the engine page, and `Page.captureScreenshot` for visuals.
- To run the dev app while the installed app is open (they share the single-instance lock), give it its own profile: `npm run dev -- --remoteDebuggingPort 9222 -- --user-data-dir=/tmp/bloktube-dev` (starts signed out).
- Offline tests: connect to the browser target (`/json/version`), `Target.attachToTarget` (flatten) to the music.youtube.com page and its `service_worker`, and `Network.emulateNetworkConditions { offline: true }` on both. Emulation only lasts while that connection stays attached. Playing test songs replaces the user's queue.

## InnerTube cheat sheet (paths for `networkManager.fetch`)

| Path | Body |
| --- | --- |
| `/browse` | `{ browseId }` — `FEmusic_home`, `FEmusic_explore`, `FEmusic_moods_and_genres`, `FEmusic_moods_and_genres_category` (+ `params`), `FEmusic_liked_playlists`, `FEmusic_liked_albums`, `FEmusic_library_corpus_artists`, `FEmusic_library_non_music_audio_list` (podcasts), `FEmusic_library_privately_owned_tracks` / `_releases` (uploads), `FEmusic_history`, `VLLM` (liked songs), `VL<playlistId>`, `MPRE…` (album), `MPSP…` (podcast show), `UC…` (artist), `MPLYt…` (lyrics) |
| `/browse` | `{ continuation }` |
| `/search` | `{ query, params? }` — filter params in `SEARCH_PARAMS` |
| `/music/get_search_suggestions` | `{ input }` |
| `/next` | `{ videoId, playlistId? }` — up next, like status, lyrics/related tab ids |
| `/like/like`, `/like/removelike`, `/like/dislike` | `{ target: { videoId } }` or `{ target: { playlistId } }` |
| `/subscription/subscribe`, `/subscription/unsubscribe` | `{ channelIds: [id] }` |
| `/account/account_menu` | `{}` |
| `/playlist/create` | `{ title, privacyStatus: 'PRIVATE', videoIds }` → `{ playlistId }` |
| `/playlist/delete` | `{ playlistId }` |
| `/browse/edit_playlist` | `{ playlistId, actions }` → `{ status }`. Actions: `ACTION_ADD_VIDEO` with `addedVideoId` + `dedupeOption` (`DEDUPE_OPTION_CHECK` / `_SKIP`), `ACTION_REMOVE_VIDEO` with `removedVideoId` + `setVideoId`, `ACTION_SET_PLAYLIST_NAME` with `playlistName`, `ACTION_SET_PLAYLIST_DESCRIPTION` with `playlistDescription`, `ACTION_MOVE_VIDEO_BEFORE` with `setVideoId` (+ `movedSetVideoIdSuccessor`; omit it to move to the end), `ACTION_SET_PLAYLIST_PRIVACY` with `playlistPrivacy` (`PUBLIC` / `UNLISTED` / `PRIVATE`; current value in the editable header's `editHeader.musicPlaylistEditHeaderRenderer.privacy`) |
| `/feedback` | `{ feedbackTokens }` — e.g. remove from history (token from the row menu's `feedbackEndpoint`) |
| `/account/get_setting`, `/account/set_setting` | `{}` → all settings; `{ settingItemId, newValue: { boolValue } or { intValue } }` |
| `/playlist/get_add_to_playlist` | `{ videoIds }` (non-empty) — YT Music's own picker: Liked Music + own playlists (not used; the library's `editable` flag covers it) |
| `/music/get_queue` | `{ queueContextParams, queueInsertPosition, videoIds }` |
| `/offline/get_download_action`, `/offline/get_playback_data_entity`, `/offline` | Called by YT Music's offline module when a download starts; don't call directly (see How downloads work) |

## Status (19 Nov 2026)

Done and working in a test harness:
- Engine loads and the bridge becomes ready; consent bypass works
- Home (quick picks + shelves + infinite scroll), search with suggestions and filters, Browse all (moods)
- Album, playlist and artist pages with artwork colours and a sticky header
- Player bar, queue panel, now-playing panel, full-screen synced lyrics
- Context menus, keyboard shortcuts, back/forward
- Playing a track loads it and its radio queue in the engine

Verified on the Mac with a signed-in Premium account (18 Nov 2026):
- Sign-in (password route), audio playback, play/pause, seek, next/previous, shuffle, repeat, volume, mute
- Library (playlists, albums, artists, Liked Songs), like/unlike (player bar and track rows), save/unsave album and playlist, follow/unfollow
- Queue add to end, play next, move, remove, jump to index, clear (keeps the current track)
- Playlist management: create ("My Playlist #N" from the sidebar +, or "New playlist" in a track's Add to playlist submenu), add (with the "Already added" dialog), remove from own playlists, edit name/description (click the title or ⋯ → Edit details), delete (⋯ or sidebar right-click)
- Downloads (online): download/remove an album or playlist (collection button with progress ring) or a song (menu), green ↓ on rows and sidebar items, "Downloaded" library filter (incl. downloads not saved to the library), Downloads view
- Packaging (18 Nov 2026): all four installers build from the Mac; the packaged arm64 app launches, stays signed in, renders with artwork and plays. The Linux build launches in an Ubuntu 24.04 x86-64 container (Xvfb) and loads the UI and the engine. The Windows installer hasn't been run on Windows yet
- Offline (CDP emulation on the UI, engine page and service worker): offline banner, Downloads view play-all with working next, downloaded album opened from local data and played with its queue, downloaded song from a cached playlist page plays, non-downloaded song shows a toast, lyrics show an offline message, everything recovers on reconnect

Verified on the Mac (19 Nov 2026):
- Settings page: YT Music audio quality and toggles (`set_setting` round trip), autoplay, fade, accent colour, tray on/off, Remove all downloads
- Sleep timer (minutes, end of track incl. with fade), mini player (render, play/pause, close)
- Recently played, Your uploads (empty state only; the account has no uploads)
- Multi-select (Shift/⌘), multi-song menu and remove, drag to reorder in own playlists, drop on sidebar playlists ("Already added" dialog), playlist privacy
- Podcasts: show page, episode playback with the show's queue, save/unsave and the sidebar Podcasts filter
- Starting offline opens Downloads (simulated by overriding `navigator.onLine` on the UI page)

Known issues:
- Guest playback stopped once after ~40s with YouTube's "Something went wrong"; signed-in playback is fine
- First play right after engine `ready` once missed the playlist queue; `play()` now re-sends the navigation if the queue doesn't contain the track after 4 s (not reproduced since)

Not verified yet (needs someone at the Mac or a PC):
- Media keys / Now Playing (the YT page sets `navigator.mediaSession`), the Dock menu, the menu-bar icon's menu, open at login; Windows taskbar buttons
- Uploads with real uploaded music; downloading podcast episodes

## Next steps (suggested order)

1. Offline, real-world check: quit the app, turn Wi-Fi off, start the packaged app, and confirm the engine loads from the service worker and Downloads opens and plays (only CDP emulation has been tested).
2. Distribution: run the Windows installer on a real PC. For sharing builds: Apple Developer ID signing + notarization (removes the Gatekeeper prompt), a Windows code-signing certificate (removes SmartScreen), and a GitHub Actions workflow that builds each platform natively once there's a repo (also enables the `.deb` via `homepage`). App icon is done (`build/icon.svg` → `scripts/make-icon.sh`).
3. Automatic updates (electron-updater) once builds are signed and published (e.g. GitHub Releases).
4. Nice-to-haves: custom playlist cover, uploading music from the app, "Episodes for Later" in the sidebar.
