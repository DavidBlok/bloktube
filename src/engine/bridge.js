;(() => {
  if (window.__blok) return

  const $ = (s) => document.querySelector(s)
  const app = () => $('ytmusic-app')
  const player = () => $('#movie_player')
  const queueEl = () => $('#queue')
  const store = () => queueEl()?.queue?.store?.store
  const bar = () => $('ytmusic-player-bar')
  const video = () => $('video')
  const post = (type, payload) => window.postMessage({ __blokEngine: true, type, payload }, location.origin)

  const text = (t) => (t?.runs ? t.runs.map((r) => r.text).join('') : (t?.simpleText ?? ''))
  const hiRes = (url, size) =>
    url && /googleusercontent|ggpht/.test(url) ? url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+/, `=s${size}`) : url
  const lastThumb = (t) => t?.thumbnails?.[t.thumbnails.length - 1]?.url
  const unwrap = (it) =>
    it?.playlistPanelVideoRenderer ?? it?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer

  function byline(runs) {
    const artists = []
    let album = null
    let segment = 0
    for (const r of runs ?? []) {
      const t = (r.text ?? '').trim()
      if (t === '•') {
        segment++
        continue
      }
      const id = r.navigationEndpoint?.browseEndpoint?.browseId
      if (id?.startsWith('MPRE')) album = { id, name: r.text }
      else if (id) artists.push({ id, name: r.text.replace(/ - Topic$/, '') })
      else if (segment === 0 && t && !/^[,&]$/.test(t)) artists.push({ id: null, name: t })
    }
    return { artists, album }
  }

  function queueItem(it) {
    const r = unwrap(it)
    if (!r?.videoId) return null
    const { artists, album } = byline(r.longBylineText?.runs ?? r.shortBylineText?.runs)
    return {
      videoId: r.videoId,
      title: text(r.title),
      artists,
      album,
      thumb: hiRes(lastThumb(r.thumbnail), 226),
      duration: text(r.lengthText) || undefined,
      selected: !!r.selected
    }
  }

  function queueState() {
    const q = store()?.getState()?.queue
    if (!q) return { items: [], index: -1, autoplay: [], autoplayEnabled: true }
    const items = (q.items ?? []).map(queueItem).filter(Boolean)
    let index = items.findIndex((i) => i.selected)
    if (index < 0 && typeof q.selectedItemIndex === 'number' && q.selectedItemIndex < items.length) index = q.selectedItemIndex
    const autoplay = (q.automixItems ?? []).map(queueItem).filter(Boolean)
    return { items, index, autoplay, autoplayEnabled: q.autoplay !== false }
  }

  function currentItem() {
    const q = queueState()
    return q.index >= 0 ? q.items[q.index] : null
  }

  function playerState() {
    const p = player()
    const v = video()
    const st = store()?.getState()
    const vd = p?.getVideoData?.() ?? {}
    const cur = currentItem()
    const ps = p?.getPlayerState?.() ?? -1
    const same = cur && cur.videoId === vd.video_id
    const details = st?.player?.playerResponse?.videoDetails
    let buffered = 0
    try {
      if (v?.buffered?.length) buffered = v.buffered.end(v.buffered.length - 1)
    } catch {
      buffered = 0
    }
    return {
      videoId: vd.video_id || cur?.videoId || null,
      title: (same && cur.title) || vd.title || cur?.title || '',
      artists:
        same && cur.artists.length
          ? cur.artists
          : vd.author
            ? [{ id: details?.channelId ?? null, name: vd.author.replace(/ - Topic$/, '') }]
            : [],
      album: (same && cur.album) || null,
      thumb: (same && cur.thumb) || hiRes(lastThumb(details?.thumbnail), 544),
      duration: p?.getDuration?.() || v?.duration || 0,
      position: p?.getCurrentTime?.() || v?.currentTime || 0,
      buffered,
      playing: ps === 1 || ps === 3 ? true : !!(v && !v.paused && !v.ended),
      buffering: ps === 3,
      volume: st?.player?.volume ?? bar()?.volume ?? p?.getVolume?.() ?? 100,
      muted: !!p?.isMuted?.(),
      shuffle: !!st?.queue?.shuffleEnabled || !!bar()?.hasAttribute('shuffle-on'),
      repeat: st?.queue?.repeatMode ?? 'NONE',
      like: $('#like-button-renderer')?.likeStatus ?? 'INDIFFERENT',
      adPlaying: !!st?.player?.adPlaying,
      isVideo: !!details?.musicVideoType && details.musicVideoType !== 'MUSIC_VIDEO_TYPE_ATV'
    }
  }

  let lastPlayer = ''
  function emitPlayer() {
    const s = playerState()
    const key = JSON.stringify(s)
    if (key !== lastPlayer) {
      lastPlayer = key
      post('player', s)
    }
  }

  let lastQueue = ''
  function emitQueue() {
    const q = queueState()
    const key = JSON.stringify(q)
    if (key !== lastQueue) {
      lastQueue = key
      post('queue', q)
    }
  }

  let kickTimer = 0
  const kick = () => {
    if (kickTimer) return
    kickTimer = setTimeout(() => {
      kickTimer = 0
      emitPlayer()
    }, 60)
  }
  let queueTimer = 0
  const kickQueue = () => {
    clearTimeout(queueTimer)
    queueTimer = setTimeout(emitQueue, 120)
  }

  const VIDEO_EVENTS = ['play', 'pause', 'playing', 'waiting', 'seeked', 'timeupdate', 'durationchange', 'volumechange', 'ended', 'loadedmetadata', 'emptied']
  let fadeSec = 0
  let audioCtx = null
  let gainNode = null
  let gainVideo = null

  function ensureGain(v) {
    if (gainVideo === v) return gainNode
    gainVideo = v
    gainNode = null
    try {
      audioCtx = audioCtx || new AudioContext()
      const src = audioCtx.createMediaElementSource(v)
      gainNode = audioCtx.createGain()
      src.connect(gainNode).connect(audioCtx.destination)
    } catch {
      gainNode = null
    }
    return gainNode
  }

  function applyFade() {
    const v = video()
    if (!v || (!fadeSec && !gainNode)) return
    const g = ensureGain(v)
    if (!g) return
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => undefined)
    let level = 1
    const p = player()
    const d = p?.getDuration?.() || 0
    const t = p?.getCurrentTime?.() || 0
    if (fadeSec && !store()?.getState()?.player?.adPlaying && Number.isFinite(d) && d > fadeSec * 3) {
      if (d - t < fadeSec) level = Math.max(0, (d - t) / fadeSec)
      else if (t < fadeSec) level = Math.min(1, t / fadeSec)
    }
    g.gain.setTargetAtTime(level, audioCtx.currentTime, 0.08)
  }

  let attachedVideo = null
  function attachVideo() {
    const v = video()
    if (!v || v === attachedVideo) return
    attachedVideo = v
    for (const e of VIDEO_EVENTS) v.addEventListener(e, kick, { passive: true })
    for (const e of ['timeupdate', 'seeked', 'playing', 'emptied']) v.addEventListener(e, applyFade, { passive: true })
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const stalled = (v, ps) => ps === 3 && !!v && v.paused && v.readyState >= 3
  const isActive = () => {
    const ps = player()?.getPlayerState?.()
    return ps === 1 || (ps === 3 && !stalled(video(), ps))
  }
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))

  async function ensurePlaying(prevId, wantId) {
    for (let i = 0; i < 40; i++) {
      await sleep(150)
      const p = player()
      const id = p?.getVideoData?.()?.video_id
      if (!id || (id === prevId && wantId !== prevId)) continue
      const s = p.getPlayerState?.()
      if (s === 1 || s === 3) return
      if (i > 6) {
        p.playVideo?.()
        return
      }
    }
  }

  async function ensureQueue(endpoint, target) {
    if (!target.playlistId || target.playlistId === 'PPSV') return
    const loaded = () => {
      const items = store()?.getState()?.queue?.items ?? []
      return items.length > 0 && (!target.videoId || items.some((it) => unwrap(it)?.videoId === target.videoId))
    }
    for (let i = 0; i < 20; i++) {
      await sleep(200)
      if (loaded()) return
    }
    app().dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }))
  }

  function likeButtons() {
    const r = $('#like-button-renderer')
    return r ? [...r.querySelectorAll('button')] : []
  }

  const entityKeyId = (k) => {
    try {
      const s = atob(decodeURIComponent(k))
      return s.slice(2, 2 + s.charCodeAt(1))
    } catch {
      return ''
    }
  }

  function downloadStatus(state) {
    const s = String(state ?? '')
    if (s.includes('COMPLETE')) return 'done'
    if (/FAIL|ERROR/.test(s)) return 'failed'
    if (/PENDING|QUEUED|NOT_STARTED/.test(s)) return 'queued'
    return 'downloading'
  }

  function downloadsState() {
    const e = store()?.getState()?.entities
    const lib = e && Object.values(e.musicDownloadsLibraryEntity ?? {})[0]
    if (!lib) return { tracks: [], playlists: [] }
    const byId = (type) => {
      const m = new Map()
      for (const v of Object.values(e[type] ?? {})) if (v) m.set(v.id ?? v.key, v)
      return m
    }
    const meta = byId('musicTrackDownloadMetadataEntity')
    const statuses = byId('downloadStatusEntity')
    const playback = byId('playbackData')
    const transfers = byId('transfer')
    const streams = byId('offlineVideoStreams')
    const individual = new Set((lib.downloadedTracks ?? []).map(entityKeyId))

    const tracks = []
    for (const t of Object.values(e.musicTrack ?? {})) {
      const m = t?.videoId && t.downloadMetadata && meta.get(t.downloadMetadata)
      if (!m) continue
      const ds = m.downloadStatusEntity
      let status = downloadStatus(ds?.downloadState ?? statuses.get(ds?.key ?? ds)?.downloadState)
      const transfer = transfers.get(playback.get(m.playbackData)?.transfer)
      let done = 0
      let total = 0
      for (const k of transfer?.offlineVideoStreams ?? []) {
        for (const p of streams.get(k)?.streamsProgress ?? []) {
          done += Number(p.numBytesDownloaded ?? 0)
          total += Number(p.numTotalBytes ?? 0)
        }
      }
      if (status !== 'done' && String(transfer?.transferState ?? '').includes('COMPLETE')) status = 'done'
      const sec = Math.round(Number(t.lengthMs ?? 0) / 1000)
      tracks.push({
        videoId: t.videoId,
        title: t.title ?? '',
        artists: t.artistNames ?? '',
        album: t.albumTitle || undefined,
        thumb: hiRes(lastThumb(t.thumbnailDetails), 226),
        durationSec: sec || undefined,
        explicit: t.contentRating?.explicitType === 'MUSIC_ENTITY_EXPLICIT_TYPE_EXPLICIT',
        isVideo: !!t.musicVideoType && t.musicVideoType !== 'MUSIC_VIDEO_TYPE_ATV',
        status,
        progress: status === 'done' ? 1 : total ? done / total : 0,
        bytes: total || undefined,
        individual: individual.has(t.videoId),
        addedAt: Number(m.addedTimestampMillis ?? 0) || undefined
      })
    }
    tracks.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))

    const byVideo = new Map(tracks.map((t) => [t.videoId, t]))
    const playlistEntities = byId('musicPlaylist')
    const playlistMeta = [...byId('musicPlaylistDownloadMetadataEntity').values()]
    const playlists = []
    for (const key of lib.downloadedPlaylists ?? []) {
      const p = playlistEntities.get(key)
      const playlistId = p?.playlistId ?? entityKeyId(key)
      const md = playlistMeta.find((x) => entityKeyId(x.id ?? x.key) === playlistId)
      const trackIds = (md?.trackDownloadMetadatas ?? []).map(entityKeyId)
      const items = trackIds.map((id) => byVideo.get(id)).filter(Boolean)
      const status = !items.length
        ? 'queued'
        : items.every((t) => t.status === 'done')
          ? 'done'
          : items.every((t) => t.status === 'failed')
            ? 'failed'
            : 'downloading'
      playlists.push({
        playlistId,
        title: p?.title ?? '',
        thumb: hiRes(lastThumb(p?.thumbnailDetails), 226),
        trackIds,
        status,
        progress: items.length ? items.reduce((a, t) => a + t.progress, 0) / items.length : 0
      })
    }
    return { tracks, playlists }
  }

  const isDownloaded = (target) => {
    const d = downloadsState()
    return target.videoId
      ? d.tracks.some((t) => t.videoId === target.videoId && t.individual)
      : d.playlists.some((p) => p.playlistId === target.playlistId)
  }

  const downloadEndpoint = (target) =>
    target.videoId
      ? { offlineVideoEndpoint: { videoId: target.videoId, onAddCommand: { getDownloadActionCommand: { videoId: target.videoId, params: 'CAI%3D' } } } }
      : {
          offlinePlaylistEndpoint: {
            playlistId: target.playlistId,
            action: 'ACTION_ADD',
            offlineability: { offlineabilityRenderer: { offlineable: true } },
            onAddCommand: { getDownloadActionCommand: { playlistId: target.playlistId, params: 'CAI%3D' } }
          }
        }

  const openDialogs = () => [...document.querySelectorAll('tp-yt-paper-dialog')].filter((d) => d.opened)

  const fmtLength = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

  function localQueueItem(t) {
    return {
      playlistPanelVideoRenderer: {
        videoId: t.videoId,
        title: { runs: [{ text: t.title }] },
        longBylineText: { runs: [{ text: t.artists }] },
        shortBylineText: { runs: [{ text: t.artists }] },
        thumbnail: { thumbnails: t.thumb ? [{ url: t.thumb, width: 226, height: 226 }] : [] },
        lengthText: { runs: [{ text: fmtLength(t.durationSec) }] },
        navigationEndpoint: { watchEndpoint: { videoId: t.videoId, playlistId: 'PPSV' } },
        selected: false
      }
    }
  }

  async function clickDownloadItem(target, confirm) {
    const el = document.createElement('ytmusic-menu-service-item-download-renderer')
    el.data = { serviceEndpoint: downloadEndpoint(target) }
    el.style.display = 'none'
    ;($('ytmusic-popup-container') ?? app()).appendChild(el)
    try {
      await sleep(250)
      ;(el.querySelector('tp-yt-paper-item') ?? el).click()
      if (!confirm) return
      for (let i = 0; i < 30; i++) {
        await sleep(100)
        const btn = openDialogs()
          .map((d) => d.querySelector('yt-confirm-dialog-renderer #confirm-button button'))
          .find(Boolean)
        if (btn) {
          btn.click()
          break
        }
      }
      await sleep(1500)
    } finally {
      el.remove()
    }
  }

  let lastDownloads = ''
  function emitDownloads() {
    const d = downloadsState()
    const key = JSON.stringify(d)
    if (key !== lastDownloads) {
      lastDownloads = key
      post('downloads', d)
    }
  }
  let downloadsTimer = 0
  const kickDownloads = () => {
    if (downloadsTimer) return
    downloadsTimer = setTimeout(() => {
      downloadsTimer = 0
      emitDownloads()
    }, 400)
  }

  const api = {
    fetch: (path, body) =>
      app()
        .networkManager.fetch(path, body ?? {})
        .catch((e) => {
          throw new Error(e?.error?.message ?? e?.message ?? String(e))
        }),
    loggedIn: () => !!window.yt?.config_?.LOGGED_IN,
    state: () => playerState(),
    queue: () => queueState(),
    downloads: () => downloadsState(),

    async download(target) {
      if (isDownloaded(target)) return true
      await clickDownloadItem(target, false)
      for (let i = 0; i < 24; i++) {
        await sleep(250)
        if (isDownloaded(target)) {
          kickDownloads()
          return true
        }
      }
      for (const d of openDialogs()) d.close?.()
      return false
    },
    async removeDownload(target) {
      if (!isDownloaded(target)) return true
      await clickDownloadItem(target, true)
      kickDownloads()
      return !isDownloaded(target)
    },

    play(target) {
      const endpoint = target.videoId
        ? { watchEndpoint: clean({ videoId: target.videoId, playlistId: target.playlistId, params: target.params }) }
        : { watchPlaylistEndpoint: clean({ playlistId: target.playlistId, params: target.params }) }
      const prev = player()?.getVideoData?.()?.video_id
      app().dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }))
      ensurePlaying(prev, target.videoId)
      ensureQueue(endpoint, target)
      return true
    },
    async playLocal(videoIds) {
      const tracks = new Map(downloadsState().tracks.filter((t) => t.status === 'done').map((t) => [t.videoId, t]))
      const ids = videoIds.filter((id) => tracks.has(id))
      if (!ids.length) return false
      const prev = player()?.getVideoData?.()?.video_id
      app().dispatchEvent(
        new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: { watchEndpoint: { videoId: ids[0], playlistId: 'PPSV' } } } })
      )
      await ensurePlaying(prev, ids[0])
      const q = queueEl()
      const s = store()
      if (!q || !s) return true
      const items = s.getState().queue.items ?? []
      const current = items.findIndex((it) => unwrap(it)?.selected && unwrap(it)?.videoId === ids[0])
      for (let i = items.length - 1; i >= 0; i--) if (i !== current) q.dispatch({ type: 'REMOVE_ITEM', payload: i })
      const add = (current >= 0 ? ids.slice(1) : ids).map((id) => localQueueItem(tracks.get(id)))
      if (add.length) {
        q.dispatch({
          type: 'ADD_ITEMS',
          payload: { nextQueueItemId: s.getState().queue.nextQueueItemId, index: s.getState().queue.items.length, items: add, shuffleEnabled: false, shouldAssignIds: true }
        })
      }
      if (current < 0) q.dispatch({ type: 'SET_INDEX', payload: 0 })
      kickQueue()
      return true
    },
    async playList(videoIds) {
      const ids = (videoIds ?? []).slice(0, 200)
      if (!ids.length) return false
      const prev = player()?.getVideoData?.()?.video_id
      app().dispatchEvent(
        new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint: { watchEndpoint: { videoId: ids[0] } } } })
      )
      await ensurePlaying(prev, ids[0])
      const q = queueEl()
      const s = store()
      if (!q || !s) return true
      for (let i = 0; i < 20 && (s.getState().queue.items?.length ?? 0) < 2; i++) await sleep(150)
      const items = s.getState().queue.items ?? []
      const current = items.findIndex((it) => unwrap(it)?.selected)
      for (let i = items.length - 1; i >= 0; i--) if (i !== current) q.dispatch({ type: 'REMOVE_ITEM', payload: i })
      if (ids.length > 1) await api.queueAdd(ids.slice(1), false)
      kickQueue()
      return true
    },
    pause() {
      player()?.pauseVideo?.()
      kick()
    },
    setFade(seconds) {
      fadeSec = Math.max(0, Math.min(12, Number(seconds) || 0))
      applyFade()
    },
    toggle() {
      const p = player()
      if (isActive()) p.pauseVideo()
      else p.playVideo()
      kick()
    },
    next() {
      const b = $('.next-button.ytmusic-player-bar')
      if (b) b.click()
      else player()?.nextVideo?.()
    },
    previous() {
      const b = $('.previous-button.ytmusic-player-bar')
      if (b) b.click()
      else player()?.previousVideo?.()
    },
    seek(seconds) {
      player()?.seekTo?.(seconds, true)
      kick()
    },
    setVolume(volume) {
      const v = Math.max(0, Math.min(100, Math.round(volume)))
      const b = bar()
      if (b?.updateVolume) b.updateVolume(v)
      else player()?.setVolume?.(v)
      if (v > 0 && player()?.isMuted?.()) player().unMute()
      kick()
    },
    toggleMute() {
      const p = player()
      if (p.isMuted()) p.unMute()
      else p.mute()
      kick()
    },
    toggleShuffle() {
      bar()?.queue?.shuffle?.()
      setTimeout(kick, 200)
    },
    cycleRepeat() {
      bar()?.onRepeatButtonClick?.()
      setTimeout(kick, 200)
    },
    toggleLike() {
      const [like] = likeButtons()
      if (like) like.click()
      else {
        const r = $('#like-button-renderer')
        r?.updateLikeStatus?.(r.likeStatus === 'LIKE' ? 'INDIFFERENT' : 'LIKE')
      }
      setTimeout(kick, 300)
    },

    queuePlayIndex(index) {
      queueEl()?.dispatch({ type: 'SET_INDEX', payload: index })
    },
    queueRemove(index) {
      queueEl()?.dispatch({ type: 'REMOVE_ITEM', payload: index })
    },
    queueMove(fromIndex, toIndex) {
      queueEl()?.dispatch({ type: 'MOVE_ITEM', payload: { fromIndex, toIndex } })
    },
    queueSetAutoplay(enabled) {
      const q = store()?.getState()?.queue
      if (!q || (q.autoplay !== false) === !!enabled) return
      const toggle = $('#automix')
      if (toggle) toggle.click()
      else queueEl()?.dispatch({ type: 'SET_AUTOPLAY_ENABLED', payload: !!enabled })
      kickQueue()
    },
    async clearDownloads() {
      const d = downloadsState()
      if (!d.tracks.length && !d.playlists.length) return true
      try {
        const res = await app().networkManager.fetch('/account/get_setting', {})
        let action = null
        const walk = (o, depth = 0) => {
          if (action || !o || typeof o !== 'object' || depth > 16) return
          if (o.settingActionRenderer && JSON.stringify(o.settingActionRenderer).includes('DELETE_ALL_DOWNLOADS')) action = o.settingActionRenderer
          else for (const v of Object.values(o)) walk(v, depth + 1)
        }
        walk(res)
        if (action) {
          const el = document.createElement('ytmusic-setting-action-renderer')
          el.data = action
          el.style.display = 'none'
          ;($('ytmusic-popup-container') ?? app()).appendChild(el)
          try {
            await sleep(250)
            ;(el.querySelector('tp-yt-paper-item, yt-button-renderer button, button') ?? el).click()
            for (let i = 0; i < 30; i++) {
              await sleep(100)
              const btn = openDialogs()
                .map((dl) => dl.querySelector('yt-confirm-dialog-renderer #confirm-button button'))
                .find(Boolean)
              if (btn) {
                btn.click()
                break
              }
            }
            for (let i = 0; i < 30; i++) {
              await sleep(200)
              const left = downloadsState()
              if (!left.tracks.length && !left.playlists.length) break
            }
          } finally {
            el.remove()
          }
        }
      } catch {
        /* fall back below */
      }
      const left = downloadsState()
      for (const p of left.playlists) await api.removeDownload({ playlistId: p.playlistId })
      for (const t of downloadsState().tracks.filter((x) => x.individual)) await api.removeDownload({ videoId: t.videoId })
      kickDownloads()
      const end = downloadsState()
      return !end.tracks.length && !end.playlists.length
    },
    queueClear() {
      const q = queueEl()
      const items = store()?.getState()?.queue?.items ?? []
      const current = items.findIndex((it) => unwrap(it)?.selected)
      for (let i = items.length - 1; i >= 0; i--) if (i !== current) q?.dispatch({ type: 'REMOVE_ITEM', payload: i })
      kickQueue()
    },
    async queueAdd(videoIds, next, at) {
      const q = queueEl()
      const s = store()
      if (!q || !s) return false
      const state = s.getState().queue
      if (!state.items?.length) return false
      const queueInsertPosition = next ? 'INSERT_AFTER_CURRENT_VIDEO' : 'INSERT_AT_END'
      const res = await app().networkManager.fetch('/music/get_queue', {
        queueContextParams: state.queueContextParams,
        queueInsertPosition,
        videoIds
      })
      const items = (res?.queueDatas ?? []).map((d) => d?.content).filter(Boolean)
      if (!items.length) return false
      const cur = s.getState().queue.items
      const selected = cur.findIndex((it) => unwrap(it)?.selected)
      q.dispatch({
        type: 'ADD_ITEMS',
        payload: {
          nextQueueItemId: s.getState().queue.nextQueueItemId,
          index: Number.isInteger(at) ? Math.max(0, Math.min(at, cur.length)) : next ? (selected >= 0 ? selected + 1 : cur.length) : cur.length,
          items,
          shuffleEnabled: false,
          shouldAssignIds: true
        }
      })
      kickQueue()
      return true
    }
  }

  window.__blok = api

  function init() {
    if (!app()?.networkManager || !player() || !store()) {
      setTimeout(init, 250)
      return
    }
    attachVideo()
    store().subscribe(() => {
      kickQueue()
      kick()
      kickDownloads()
    })
    setInterval(() => {
      attachVideo()
      emitPlayer()
    }, 1000)
    post('ready', { loggedIn: api.loggedIn() })
    emitPlayer()
    emitQueue()
    emitDownloads()
  }
  init()
})()
