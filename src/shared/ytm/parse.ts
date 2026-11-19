import type {
  Account,
  ArtistPage,
  Card,
  HistorySection,
  YtmSetting,
  CardKind,
  CollectionPage,
  LibraryItem,
  LikeStatus,
  PlayTarget,
  Ref,
  SearchFilter,
  SearchResults,
  Shelf,
  ShelfPage,
  Track
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export function get(o: J, ...path: (string | number)[]): J {
  for (const k of path) {
    if (o == null) return undefined
    o = o[k]
  }
  return o
}

export function findKey(root: J, key: string, maxDepth = 12): J {
  const stack: [J, number][] = [[root, 0]]
  while (stack.length) {
    const [node, depth] = stack.shift()!
    if (!node || typeof node !== 'object' || depth > maxDepth) continue
    if (key in node) return node[key]
    for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push([v, depth + 1])
  }
  return undefined
}

export const text = (t: J): string =>
  t?.runs ? t.runs.map((r: J) => r.text).join('') : (t?.simpleText ?? t?.content ?? '')

const SEP = ' • '
const isSep = (r: J) => typeof r?.text === 'string' && r.text.trim() === '•'
const DURATION_RE = /^(\d+:)*\d+:\d+$/
const YEAR_RE = /^\d{4}$/

export function hiRes(url: string | undefined, size = 544): string | undefined {
  if (!url) return url
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
    if (/=s\d+/.test(url)) return url.replace(/=s\d+/, `=s${size}`)
  }
  return url
}

export function bestThumb(thumbs: J[] | undefined, size = 544): string | undefined {
  if (!Array.isArray(thumbs) || !thumbs.length) return undefined
  return hiRes(thumbs[thumbs.length - 1]?.url, size)
}

export function thumbOf(r: J, size = 544): string | undefined {
  return bestThumb(
    get(r, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails') ??
      get(r, 'thumbnailRenderer', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails') ??
      get(r, 'thumbnail', 'croppedSquareThumbnailRenderer', 'thumbnail', 'thumbnails') ??
      get(r, 'thumbnail', 'thumbnails') ??
      get(r, 'thumbnail', 'musicAnimatedThumbnailRenderer', 'backupRenderer', 'thumbnails'),
    size
  )
}

export function durationToSec(d?: string): number | undefined {
  if (!d || !DURATION_RE.test(d.trim())) return undefined
  return d
    .trim()
    .split(':')
    .reverse()
    .reduce((acc, part, i) => acc + Number(part) * 60 ** i, 0)
}

const pageTypeOf = (ep: J): string | undefined =>
  get(ep, 'browseEndpoint', 'browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType')

function kindFromPageType(pt?: string, browseId?: string): CardKind {
  switch (pt) {
    case 'MUSIC_PAGE_TYPE_ALBUM':
    case 'MUSIC_PAGE_TYPE_AUDIOBOOK':
      return 'album'
    case 'MUSIC_PAGE_TYPE_ARTIST':
    case 'MUSIC_PAGE_TYPE_USER_CHANNEL':
    case 'MUSIC_PAGE_TYPE_LIBRARY_ARTIST':
      return 'artist'
    case 'MUSIC_PAGE_TYPE_PLAYLIST':
      return 'playlist'
    case 'MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE':
      return 'podcast'
    case 'MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE':
      return 'episode'
  }
  if (!browseId) return 'unknown'
  if (browseId.startsWith('MPRE')) return 'album'
  if (browseId.startsWith('VL')) return 'playlist'
  if (browseId.startsWith('UC') || browseId.startsWith('MPLA')) return 'artist'
  return 'unknown'
}

export function normalizeBrowseId(id: string): string {
  return id.startsWith('MPLAUC') ? id.slice(4) : id
}

export function endpointToTarget(ep: J): PlayTarget | undefined {
  if (!ep) return undefined
  if (ep.watchPlaylistEndpoint)
    return { playlistId: ep.watchPlaylistEndpoint.playlistId, params: ep.watchPlaylistEndpoint.params }
  if (ep.watchEndpoint) {
    const w = ep.watchEndpoint
    return { videoId: w.videoId, playlistId: w.playlistId, params: w.params }
  }
  return undefined
}

const videoTypeOf = (ep: J): string | undefined =>
  get(ep, 'watchEndpoint', 'watchEndpointMusicSupportedConfigs', 'watchEndpointMusicConfig', 'musicVideoType')

const linkedArtists = (runs: J[] | undefined): Ref[] =>
  (runs ?? [])
    .filter((r) => {
      const id = get(r, 'navigationEndpoint', 'browseEndpoint', 'browseId')
      return id && (id.startsWith('UC') || kindFromPageType(pageTypeOf(r.navigationEndpoint), id) === 'artist')
    })
    .map((r) => ({ id: normalizeBrowseId(get(r, 'navigationEndpoint', 'browseEndpoint', 'browseId')), name: r.text }))

interface RunInfo {
  artists: Ref[]
  album: Ref | null
  duration?: string
  year?: string
  views?: string
}

export function parseSongRuns(runs: J[] | undefined): RunInfo {
  const out: RunInfo = { artists: [], album: null }
  if (!runs?.length) return out
  let rs = runs
  if (
    rs.length > 2 &&
    !rs[0].navigationEndpoint &&
    isSep(rs[1]) &&
    (rs[2].navigationEndpoint || DURATION_RE.test(rs[2].text) || /^\d/.test(rs[2].text))
  ) {
    rs = rs.slice(2)
  }
  let segment = 0
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]
    const t: string = r.text ?? ''
    if (isSep(r)) {
      segment++
      continue
    }
    const bid = get(r, 'navigationEndpoint', 'browseEndpoint', 'browseId')
    if (r.navigationEndpoint) {
      if (bid && (bid.startsWith('MPRE') || bid.includes('release_detail'))) out.album = { id: bid, name: t }
      else if (bid) out.artists.push({ id: normalizeBrowseId(bid), name: t })
      continue
    }
    const trimmed = t.trim()
    if (!trimmed || /^[,&]$/.test(trimmed)) continue
    if (DURATION_RE.test(trimmed)) out.duration = trimmed
    else if (YEAR_RE.test(trimmed)) out.year = trimmed
    else if (/^\d[\d.,]*\s?[A-Za-zÀ-ɏ]*\s+\S/.test(trimmed)) out.views = trimmed
    else if (segment === 0) {
      if (/^(and|en|und|et|y|x)$/i.test(trimmed) && out.artists.length) continue
      out.artists.push({ id: null, name: trimmed })
    } else if (!out.album) out.album = { id: null, name: trimmed }
  }
  return out
}

function flexCols(r: J): J[] {
  return (r.flexColumns ?? []).map((c: J) => get(c, 'musicResponsiveListItemFlexColumnRenderer', 'text'))
}

const overlayEndpoint = (r: J): J =>
  get(r, 'overlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint') ??
  get(r, 'thumbnailOverlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint')

const isExplicit = (r: J): boolean =>
  [...(r.badges ?? []), ...(r.subtitleBadges ?? [])].some(
    (b: J) => get(b, 'musicInlineBadgeRenderer', 'icon', 'iconType') === 'MUSIC_EXPLICIT_BADGE'
  )

export function parseListItem(r: J): Track | Card | null {
  if (!r) return null
  const cols = flexCols(r)
  const titleRun = cols[0]?.runs?.[0]
  const title = text(cols[0])
  const nav = r.navigationEndpoint
  const browseId: string | undefined = get(nav, 'browseEndpoint', 'browseId')
  const overlayEp = overlayEndpoint(r)

  if (browseId) {
    const kind = kindFromPageType(pageTypeOf(nav), browseId)
    const subRuns = cols[1]?.runs ?? []
    const card: Card = {
      kind,
      id: normalizeBrowseId(browseId),
      title,
      subtitle: text(cols[1]),
      thumb: thumbOf(r, 320),
      play: endpointToTarget(overlayEp),
      artists: linkedArtists(subRuns)
    }
    return card
  }

  const titleEp = titleRun?.navigationEndpoint
  const videoId: string | undefined =
    get(titleEp, 'watchEndpoint', 'videoId') ?? get(r, 'playlistItemData', 'videoId') ?? get(overlayEp, 'watchEndpoint', 'videoId')

  if (!videoId) {
    const target = endpointToTarget(overlayEp)
    if (target?.playlistId) {
      return { kind: 'mix', id: `VL${target.playlistId}`, title, subtitle: text(cols[1]), thumb: thumbOf(r, 320), play: target }
    }
    return null
  }

  const info = parseSongRuns(cols[1]?.runs)
  for (const col of cols.slice(2)) {
    const run = col?.runs?.[0]
    const bid = get(run, 'navigationEndpoint', 'browseEndpoint', 'browseId')
    if (bid && bid.startsWith('MPRE')) info.album = { id: bid, name: run.text }
    else if (!info.views && col?.runs && !run?.navigationEndpoint && /^\d/.test(text(col))) info.views = text(col)
  }
  const fixed = get(r, 'fixedColumns', 0, 'musicResponsiveListItemFixedColumnRenderer', 'text')
  const duration = text(fixed).trim() || info.duration
  const vt = videoTypeOf(overlayEp) ?? videoTypeOf(titleEp)

  return {
    videoId,
    title,
    artists: info.artists,
    album: info.album,
    duration: duration || undefined,
    durationSec: durationToSec(duration),
    thumb: thumbOf(r, 120),
    explicit: isExplicit(r),
    isVideo: !!vt && vt !== 'MUSIC_VIDEO_TYPE_ATV',
    setVideoId: get(r, 'playlistItemData', 'playlistSetVideoId'),
    playlistId: get(titleEp, 'watchEndpoint', 'playlistId') ?? get(overlayEp, 'watchEndpoint', 'playlistId'),
    likeStatus: get(r, 'menu', 'menuRenderer', 'topLevelButtons', 0, 'likeButtonRenderer', 'likeStatus') as LikeStatus | undefined,
    available: r.musicItemRendererDisplayPolicy !== 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT',
    views: info.views,
    index: text(r.index) || undefined
  }
}

export function parseTwoRow(r: J): Card | null {
  if (!r) return null
  const titleRun = r.title?.runs?.[0]
  const nav = r.navigationEndpoint ?? titleRun?.navigationEndpoint
  const browseId: string | undefined = get(nav, 'browseEndpoint', 'browseId')
  const overlayEp = overlayEndpoint(r)
  const subRuns: J[] = r.subtitle?.runs ?? []
  const base = {
    title: text(r.title),
    subtitle: text(r.subtitle),
    thumb: thumbOf(r, 400),
    wide: String(r.aspectRatio ?? '').includes('16_9'),
    artists: linkedArtists(subRuns),
    year: subRuns.map((x) => String(x.text).trim()).find((t) => YEAR_RE.test(t))
  }
  if (browseId) {
    const kind = kindFromPageType(pageTypeOf(nav), browseId)
    if (kind === 'unknown') return null
    const editable = kind === 'playlist' && hasPlaylistEditor(get(r, 'menu', 'menuRenderer', 'items'))
    return { ...base, kind, id: normalizeBrowseId(browseId), play: endpointToTarget(overlayEp), ...(editable && { editable }) }
  }
  if (nav?.watchPlaylistEndpoint) {
    const t = endpointToTarget(nav)!
    return { ...base, kind: 'mix', id: `VL${t.playlistId}`, play: t }
  }
  if (nav?.watchEndpoint) {
    const t = endpointToTarget(nav)!
    const vt = videoTypeOf(nav)
    return { ...base, kind: vt && vt !== 'MUSIC_VIDEO_TYPE_ATV' ? 'video' : 'song', id: t.videoId!, play: t }
  }
  return null
}

function parseNavButton(r: J): Card | null {
  const ep = get(r, 'clickCommand', 'browseEndpoint')
  if (!ep) return null
  const c = get(r, 'solid', 'leftStripeColor')
  return {
    kind: 'category',
    id: ep.browseId,
    params: ep.params,
    title: text(r.buttonText),
    subtitle: '',
    color: typeof c === 'number' ? `#${((c >>> 0) & 0xffffff).toString(16).padStart(6, '0')}` : undefined
  }
}

function itemsToShelfContent(items: J[]): { cards: Card[]; tracks: Track[] } {
  const cards: Card[] = []
  const tracks: Track[] = []
  for (const it of items ?? []) {
    if (it.musicTwoRowItemRenderer) {
      const c = parseTwoRow(it.musicTwoRowItemRenderer)
      if (c) cards.push(c)
    } else if (it.musicResponsiveListItemRenderer) {
      const x = parseListItem(it.musicResponsiveListItemRenderer)
      if (!x) continue
      if ('videoId' in x) tracks.push(x)
      else cards.push(x)
    } else if (it.musicNavigationButtonRenderer) {
      const c = parseNavButton(it.musicNavigationButtonRenderer)
      if (c) cards.push(c)
    } else if (it.musicMultiRowListItemRenderer) {
      const m = it.musicMultiRowListItemRenderer
      const videoId = get(m, 'onTap', 'watchEndpoint', 'videoId')
      if (videoId)
        tracks.push({ videoId, title: text(m.title), artists: [], thumb: thumbOf(m, 120), duration: undefined })
    }
  }
  return { cards, tracks }
}

const moreOf = (ep: J): Shelf['more'] => {
  const b = get(ep, 'browseEndpoint')
  return b?.browseId ? { browseId: b.browseId, params: b.params } : undefined
}

export function parseShelves(sections: J[] | undefined): Shelf[] {
  const out: Shelf[] = []
  for (const s of sections ?? []) {
    const car = s.musicCarouselShelfRenderer ?? s.musicImmersiveCarouselShelfRenderer
    if (car) {
      const h = get(car, 'header', 'musicCarouselShelfBasicHeaderRenderer') ?? get(car, 'header', 'musicImmersiveCarouselShelfBasicHeaderRenderer')
      const { cards, tracks } = itemsToShelfContent(car.contents)
      if (!cards.length && !tracks.length) continue
      out.push({
        title: text(h?.title),
        strapline: text(h?.strapline) || undefined,
        layout: tracks.length > cards.length ? 'tracks' : 'carousel',
        cards,
        tracks,
        more: moreOf(get(h, 'moreContentButton', 'buttonRenderer', 'navigationEndpoint')) ?? moreOf(get(h, 'title', 'runs', 0, 'navigationEndpoint'))
      })
      continue
    }
    const shelf = s.musicShelfRenderer ?? s.musicPlaylistShelfRenderer
    if (shelf) {
      const { cards, tracks } = itemsToShelfContent(shelf.contents)
      if (!cards.length && !tracks.length) continue
      out.push({
        title: text(shelf.title),
        layout: tracks.length >= cards.length ? 'tracks' : 'grid',
        cards,
        tracks,
        more: moreOf(shelf.bottomEndpoint) ?? moreOf(get(shelf, 'title', 'runs', 0, 'navigationEndpoint'))
      })
      continue
    }
    if (s.gridRenderer) {
      const { cards, tracks } = itemsToShelfContent(s.gridRenderer.items)
      if (!cards.length && !tracks.length) continue
      out.push({ title: text(get(s.gridRenderer, 'header', 'gridHeaderRenderer', 'title')), layout: 'grid', cards, tracks })
      continue
    }
    if (s.itemSectionRenderer) out.push(...parseShelves(s.itemSectionRenderer.contents))
  }
  return out
}

function sectionListOf(resp: J): J {
  return (
    get(resp, 'continuationContents', 'sectionListContinuation') ??
    get(resp, 'contents', 'singleColumnBrowseResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer') ??
    get(resp, 'contents', 'sectionListRenderer') ??
    findKey(resp?.contents, 'sectionListRenderer')
  )
}

const nextContinuation = (holder: J): string | undefined =>
  get(holder, 'continuations', 0, 'nextContinuationData', 'continuation') ??
  get(holder, 'continuations', 0, 'reloadContinuationData', 'continuation')

const tokenFromItems = (items: J[] | undefined): string | undefined => {
  const last = items?.[items.length - 1]
  return (
    get(last, 'continuationItemRenderer', 'continuationEndpoint', 'continuationCommand', 'token') ??
    (get(last, 'continuationItemRenderer', 'continuationEndpoint', 'commandExecutorCommand', 'commands') ?? []).find(
      (c: J) => c.continuationCommand
    )?.continuationCommand?.token
  )
}

export function parseShelfPage(resp: J): ShelfPage {
  const sl = sectionListOf(resp)
  return {
    title: text(get(resp, 'header', 'musicHeaderRenderer', 'title')) || undefined,
    shelves: parseShelves(sl?.contents),
    continuation: nextContinuation(sl)
  }
}

export function parseMoods(resp: J): Card[] {
  const sl = sectionListOf(resp)
  return parseShelves(sl?.contents).flatMap((s) => s.cards.filter((c) => c.kind === 'category'))
}

function hasPlaylistEditor(items: J[] | undefined): boolean {
  return !!items && JSON.stringify(items).includes('"playlistEditorEndpoint"')
}

function menuTarget(items: J[] | undefined, icon: string): PlayTarget | undefined {
  for (const it of items ?? []) {
    const m = it.menuNavigationItemRenderer
    if (m && get(m, 'icon', 'iconType') === icon) return endpointToTarget(m.navigationEndpoint)
  }
  return undefined
}

export function parseCollection(resp: J, browseId: string): CollectionPage {
  const tc = get(resp, 'contents', 'twoColumnBrowseResultsRenderer')
  const headerHost = get(tc, 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer', 'contents', 0)
  const editable = headerHost?.musicEditablePlaylistDetailHeaderRenderer ?? resp?.header?.musicEditablePlaylistDetailHeaderRenderer
  const h =
    headerHost?.musicResponsiveHeaderRenderer ??
    get(editable, 'header', 'musicResponsiveHeaderRenderer') ??
    get(editable, 'header', 'musicDetailHeaderRenderer') ??
    resp?.header?.musicDetailHeaderRenderer ??
    findKey(resp, 'musicResponsiveHeaderRenderer') ??
    {}

  const isAlbum = browseId.startsWith('MPRE')
  const isPodcast = browseId.startsWith('MPSP')
  const subRuns: J[] = h.subtitle?.runs ?? []
  const facepile = get(h, 'facepile', 'avatarStackViewModel')
  let artists = linkedArtists(h.straplineTextOne?.runs)
  if (!artists.length && h.straplineTextOne) artists = [{ id: null, name: text(h.straplineTextOne) }]
  if (!artists.length && facepile) {
    artists = [
      {
        id: get(facepile, 'rendererContext', 'commandContext', 'onTap', 'innertubeCommand', 'browseEndpoint', 'browseId') ?? null,
        name: text(facepile.text)
      }
    ]
  }
  if (!artists.length) artists = linkedArtists(subRuns)

  const buttons: J[] = h.buttons ?? []
  const playBtn = buttons.find((b) => b.musicPlayButtonRenderer)?.musicPlayButtonRenderer
  const toggle = buttons.find((b) => b.toggleButtonRenderer)?.toggleButtonRenderer
  const menuItems = buttons.find((b) => b.menuRenderer)?.menuRenderer?.items ?? get(h, 'menu', 'menuRenderer', 'items')

  const secondary: J[] =
    get(tc, 'secondaryContents', 'sectionListRenderer', 'contents') ??
    get(resp, 'contents', 'singleColumnBrowseResultsRenderer', 'tabs', 0, 'tabRenderer', 'content', 'sectionListRenderer', 'contents') ??
    []
  const shelfIdx = secondary.findIndex((s) => s.musicPlaylistShelfRenderer || s.musicShelfRenderer)
  const shelf = shelfIdx >= 0 ? (secondary[shelfIdx].musicPlaylistShelfRenderer ?? secondary[shelfIdx].musicShelfRenderer) : null
  const rows: J[] = shelf?.contents ?? []
  const play = endpointToTarget(playBtn?.playNavigationEndpoint)
  const thumb = thumbOf(h, 544)

  const tracks = parseTrackRows(rows)
  const title = text(h.title)
  if (isPodcast) {
    for (const t of tracks) {
      t.artists = artists
      t.album = { id: browseId, name: title }
    }
  }
  if (isAlbum) {
    for (const t of tracks) {
      if (!t.artists.length) t.artists = artists
      if (!t.album) t.album = { id: browseId, name: title }
      if (!t.thumb) t.thumb = hiRes(thumb, 120)
      t.isVideo = false
    }
  }

  const playlistId: string | undefined =
    shelf?.playlistId ?? play?.playlistId ?? tracks.find((t) => t.playlistId)?.playlistId ?? (browseId.startsWith('VL') ? browseId.slice(2) : isPodcast ? browseId.slice(4) : undefined)

  return {
    kind: isAlbum ? 'album' : isPodcast ? 'podcast' : 'playlist',
    id: browseId,
    title,
    typeLabel: isPodcast ? 'Podcast' : String(subRuns[0]?.text ?? (isAlbum ? 'Album' : 'Playlist')),
    thumb,
    description: text(get(h, 'description', 'musicDescriptionShelfRenderer', 'description')) || text(h.description) || undefined,
    artists,
    ownerThumb:
      bestThumb(get(h, 'straplineThumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'), 64) ??
      get(facepile, 'avatars', 0, 'avatarViewModel', 'image', 'sources', 0, 'url'),
    year: subRuns.map((r) => String(r.text).trim()).find((t) => YEAR_RE.test(t)),
    meta: (h.secondSubtitle?.runs ?? []).filter((r: J) => !isSep(r)).map((r: J) => String(r.text)),
    play: play ?? (playlistId ? { playlistId } : undefined),
    shuffle: menuTarget(menuItems, 'MUSIC_SHUFFLE'),
    radio: menuTarget(menuItems, 'MIX'),
    playlistId,
    tracks,
    continuation: tokenFromItems(rows) ?? nextContinuation(shelf),
    related: parseShelves(secondary.filter((_, i) => i !== shelfIdx)),
    saved: toggle ? !!toggle.isToggled : undefined,
    editable: !!editable,
    privacy: PRIVACY.has(get(editable, 'editHeader', 'musicPlaylistEditHeaderRenderer', 'privacy'))
      ? get(editable, 'editHeader', 'musicPlaylistEditHeaderRenderer', 'privacy')
      : undefined
  }
}

const PRIVACY = new Set(['PUBLIC', 'UNLISTED', 'PRIVATE'])

function parseTrackRows(rows: J[]): Track[] {
  const tracks: Track[] = []
  for (const row of rows) {
    const x = row.musicMultiRowListItemRenderer ? parseEpisode(row.musicMultiRowListItemRenderer) : parseListItem(row.musicResponsiveListItemRenderer)
    if (x && 'videoId' in x) tracks.push(x)
  }
  return tracks
}

export function spokenDurationToSec(d?: string): number | undefined {
  const m = d?.match(/^(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?\s*(?:(\d+)\s*sec)?$/)
  if (!m || !(m[1] || m[2] || m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

function parseEpisode(r: J): Track | null {
  const ep = r?.onTap?.watchEndpoint ?? get(r, 'overlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint', 'watchEndpoint')
  if (!ep?.videoId) return null
  const progress = get(r, 'playbackProgress', 'musicPlaybackProgressRenderer')
  const runs = (progress?.durationText?.runs ?? []).filter((x: J) => !isSep(x))
  const duration = runs.map((x: J) => String(x.text).trim()).join(' ') || undefined
  const sub = (r.subtitle?.runs ?? []).filter((x: J) => !isSep(x)).map((x: J) => String(x.text).trim())
  const pct = Number(progress?.playbackProgressPercentage)
  return {
    videoId: ep.videoId,
    title: text(r.title),
    artists: [],
    duration,
    durationSec: spokenDurationToSec(duration),
    thumb: thumbOf(r, 226),
    isVideo: false,
    episode: {
      description: text(r.description) || undefined,
      date: sub.find((x: string) => !/views?$/i.test(x)),
      progress: pct > 0 ? Math.min(100, pct) : undefined
    }
  }
}

export function parseCollectionContinuation(resp: J): { tracks: Track[]; continuation?: string } {
  const items: J[] | undefined =
    get(resp, 'onResponseReceivedActions', 0, 'appendContinuationItemsAction', 'continuationItems') ??
    get(resp, 'continuationContents', 'musicPlaylistShelfContinuation', 'contents') ??
    get(resp, 'continuationContents', 'musicShelfContinuation', 'contents')
  const holder = get(resp, 'continuationContents', 'musicPlaylistShelfContinuation') ?? get(resp, 'continuationContents', 'musicShelfContinuation')
  return { tracks: parseTrackRows(items ?? []), continuation: tokenFromItems(items) ?? nextContinuation(holder) }
}

export function parseArtist(resp: J, browseId: string): ArtistPage {
  const h =
    get(resp, 'header', 'musicImmersiveHeaderRenderer') ??
    get(resp, 'header', 'musicVisualHeaderRenderer') ??
    get(resp, 'header', 'musicHeaderRenderer') ??
    {}
  const sub = get(h, 'subscriptionButton', 'subscribeButtonRenderer')
  const sections: J[] = sectionListOf(resp)?.contents ?? []
  const topIdx = sections.findIndex((s) => s.musicShelfRenderer)
  const top = topIdx >= 0 ? sections[topIdx].musicShelfRenderer : null
  const topSongs = top ? parseTrackRows(top.contents ?? []) : []
  const topMore = moreOf(top?.bottomEndpoint) ?? moreOf(get(top, 'title', 'runs', 0, 'navigationEndpoint'))
  const shuffleEp = get(h, 'playButton', 'buttonRenderer', 'navigationEndpoint')
  const radioEp = get(h, 'startRadioButton', 'buttonRenderer', 'navigationEndpoint')
  return {
    id: browseId,
    name: text(h.title),
    thumb: thumbOf(h, 1440),
    description: text(h.description) || undefined,
    subscribers: text(h.monthlyListenerCount) || text(sub?.subscriberCountText) || undefined,
    channelId: sub?.channelId,
    subscribed: sub?.subscribed,
    shuffle: endpointToTarget(shuffleEp),
    radio: endpointToTarget(radioEp),
    topSongs,
    topSongsPlaylist: topMore?.browseId,
    shelves: parseShelves(sections.filter((_, i) => i !== topIdx))
  }
}

export const SEARCH_PARAMS: Record<SearchFilter, string> = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  playlists: 'Eg-KAQwIABAAGAAgACgBMABqChAEEAMQCRAFEAo%3D',
  podcasts: 'EgWKAQJQAWoMEA4QChADEAQQCRAF'
}

function parseTopCard(c: J): Card | undefined {
  const tr = c?.title?.runs?.[0]
  const ep = tr?.navigationEndpoint
  if (!ep) return undefined
  const subRuns: J[] = c.subtitle?.runs ?? []
  const playEp =
    get(c, 'thumbnailOverlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint') ??
    get(c, 'buttons', 0, 'buttonRenderer', 'command')
  const base = { title: text(c.title), subtitle: text(c.subtitle), thumb: thumbOf(c, 400), artists: linkedArtists(subRuns) }
  const bid = get(ep, 'browseEndpoint', 'browseId')
  if (bid) return { ...base, kind: kindFromPageType(pageTypeOf(ep), bid), id: normalizeBrowseId(bid), play: endpointToTarget(playEp) }
  const t = endpointToTarget(ep)
  if (t?.videoId) {
    const vt = videoTypeOf(ep)
    return { ...base, kind: vt && vt !== 'MUSIC_VIDEO_TYPE_ATV' ? 'video' : 'song', id: t.videoId, play: t }
  }
  return undefined
}

export function parseSearch(resp: J, query: string, filter?: SearchFilter): SearchResults {
  const out: SearchResults = { query, filter, topTracks: [], shelves: [], tracks: [], cards: [] }
  const cont = get(resp, 'continuationContents', 'musicShelfContinuation')
  if (cont) {
    const { cards, tracks } = itemsToShelfContent(cont.contents)
    out.cards = cards
    out.tracks = tracks
    out.continuation = nextContinuation(cont)
    return out
  }
  const tabs: J[] = get(resp, 'contents', 'tabbedSearchResultsRenderer', 'tabs') ?? []
  const tab = tabs.find((t) => t.tabRenderer?.selected) ?? tabs[0]
  const sections: J[] = get(tab, 'tabRenderer', 'content', 'sectionListRenderer', 'contents') ?? []
  const flat = { cards: [] as Card[], tracks: [] as Track[] }
  for (const s of sections) {
    if (s.musicCardShelfRenderer) {
      out.top = parseTopCard(s.musicCardShelfRenderer)
      out.topTracks = itemsToShelfContent(s.musicCardShelfRenderer.contents).tracks
      if (out.top?.kind === 'artist')
        for (const t of out.topTracks) if (!t.artists.length) t.artists = [{ id: out.top.id, name: out.top.title }]
    } else if (s.itemSectionRenderer) {
      const { cards, tracks } = itemsToShelfContent(s.itemSectionRenderer.contents)
      flat.cards.push(...cards)
      flat.tracks.push(...tracks)
    } else if (s.musicShelfRenderer) {
      const { cards, tracks } = itemsToShelfContent(s.musicShelfRenderer.contents)
      if (filter) {
        out.cards.push(...cards)
        out.tracks.push(...tracks)
        out.continuation = nextContinuation(s.musicShelfRenderer)
      } else if (cards.length || tracks.length) {
        out.shelves.push({ title: text(s.musicShelfRenderer.title), layout: tracks.length ? 'tracks' : 'carousel', cards, tracks })
      }
    }
  }
  if (filter) {
    out.cards.push(...flat.cards)
    out.tracks.push(...flat.tracks)
  } else if (flat.cards.length || flat.tracks.length) {
    const group = (title: string, tracks: Track[], cards: Card[]) =>
      (tracks.length || cards.length) &&
      out.shelves.push({ title, layout: tracks.length ? 'tracks' : 'carousel', cards, tracks })
    const songs = flat.tracks.filter((t) => !t.isVideo)
    const seen = new Set(out.topTracks.map((t) => t.videoId))
    out.topTracks = [...out.topTracks, ...songs.filter((t) => !seen.has(t.videoId))].slice(0, 4)
    if (!out.topTracks.length) group('Songs', songs, [])
    group('Videos', flat.tracks.filter((t) => t.isVideo), [])
    group('Artists', [], flat.cards.filter((c) => c.kind === 'artist'))
    group('Albums', [], flat.cards.filter((c) => c.kind === 'album'))
    group('Playlists', [], flat.cards.filter((c) => c.kind === 'playlist' || c.kind === 'mix'))
    group('Podcasts', [], flat.cards.filter((c) => c.kind === 'podcast' || c.kind === 'episode'))
  }
  return out
}

export function parseSuggestions(resp: J): string[] {
  const out: string[] = []
  for (const section of resp?.contents ?? []) {
    for (const c of get(section, 'searchSuggestionsSectionRenderer', 'contents') ?? []) {
      const s = get(c, 'searchSuggestionRenderer', 'suggestion')
      if (s) out.push(text(s))
    }
  }
  return out
}

export function parseLibraryPage(resp: J): { items: LibraryItem[]; continuation?: string } {
  const gridCont = get(resp, 'continuationContents', 'gridContinuation')
  const shelfCont = get(resp, 'continuationContents', 'musicShelfContinuation')
  if (gridCont || shelfCont) {
    const holder = gridCont ?? shelfCont
    const { cards } = itemsToShelfContent(gridCont ? gridCont.items : shelfCont.contents)
    return { items: cards, continuation: nextContinuation(holder) }
  }
  const sl = sectionListOf(resp)
  const grid = findKey(sl, 'gridRenderer')
  const shelf = findKey(sl, 'musicShelfRenderer')
  const holder = grid ?? shelf
  if (!holder) return { items: [] }
  const { cards } = itemsToShelfContent(grid ? grid.items : shelf.contents)
  return { items: cards, continuation: nextContinuation(holder) }
}

export function parseHistory(resp: J): HistorySection[] {
  const sections: J[] = sectionListOf(resp)?.contents ?? []
  return sections.flatMap((sec) => {
    const shelf = sec.musicShelfRenderer
    if (!shelf) return []
    const tracks: Track[] = []
    for (const row of shelf.contents ?? []) {
      const r = row.musicResponsiveListItemRenderer
      const t = parseListItem(r)
      if (!t || !('videoId' in t)) continue
      const remove = (get(r, 'menu', 'menuRenderer', 'items') ?? []).find((it: J) => get(it, 'menuServiceItemRenderer', 'serviceEndpoint', 'feedbackEndpoint'))
      tracks.push({ ...t, historyToken: get(remove, 'menuServiceItemRenderer', 'serviceEndpoint', 'feedbackEndpoint', 'feedbackToken') })
    }
    return tracks.length ? [{ title: text(shelf.title), tracks }] : []
  })
}

export function parseUploadedTracks(resp: J): { tracks: Track[]; continuation?: string } {
  const cont = get(resp, 'continuationContents', 'musicShelfContinuation')
  const shelf = cont ?? findKey(sectionListOf(resp), 'musicShelfRenderer')
  const rows: J[] = shelf?.contents ?? []
  return { tracks: parseTrackRows(rows), continuation: tokenFromItems(rows) ?? nextContinuation(shelf) }
}

const SETTING_CATEGORIES = new Set(['General', 'Playback', 'Privacy & data', 'Recommendations'])

export function parseSettings(resp: J): YtmSetting[] {
  const out: YtmSetting[] = []
  const categories: J[] = []
  const walk = (o: J, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 14) return
    if (o.settingCategoryCollectionRenderer) categories.push(o.settingCategoryCollectionRenderer)
    else for (const v of Object.values(o)) walk(v, depth + 1)
  }
  walk(resp)
  for (const c of categories) {
    const category = text(c.title)
    if (!SETTING_CATEGORIES.has(category)) continue
    for (const it of c.items ?? []) {
      const b = it.settingBooleanRenderer
      const m = it.settingSingleOptionMenuRenderer
      if (b) {
        const id = get(b, 'enableServiceEndpoint', 'setSettingEndpoint', 'settingItemId')
        if (id) out.push({ kind: 'toggle', id: String(id), category, title: text(b.title), summary: text(b.summary) || undefined, value: !!b.enabled })
      } else if (m) {
        const items: J[] = m.items ?? []
        const options = items.map((x) => x.settingMenuItemRenderer).filter(Boolean)
        const id = get(options[0], 'updateServiceEndpoint', 'setSettingEndpoint', 'settingItemId')
        if (!id || !options.length) continue
        out.push({
          kind: 'choice',
          id: String(id),
          category,
          title: text(m.title),
          summary: text(m.summary) || undefined,
          value: String(options.find((o) => o.selected)?.value ?? ''),
          options: options.map((o) => ({ value: String(o.value), label: String(o.name) }))
        })
      }
    }
  }
  return out
}

export function parseAccount(resp: J): Account | undefined {
  const h = findKey(resp, 'activeAccountHeaderRenderer')
  if (!h) return undefined
  return { name: text(h.accountName), handle: text(h.channelHandle) || undefined, thumb: bestThumb(get(h, 'accountPhoto', 'thumbnails'), 88) }
}

export function lyricsBrowseId(next: J): string | undefined {
  const tabs: J[] =
    get(next, 'contents', 'singleColumnMusicWatchNextResultsRenderer', 'tabbedRenderer', 'watchNextTabbedResultsRenderer', 'tabs') ?? []
  for (const t of tabs) {
    const id = get(t, 'tabRenderer', 'endpoint', 'browseEndpoint', 'browseId')
    if (typeof id === 'string' && id.startsWith('MPLYt')) return id
  }
  return undefined
}

export function parseLyrics(resp: J): { text: string; source?: string } | null {
  const shelf = findKey(resp, 'musicDescriptionShelfRenderer')
  const t = text(shelf?.description)
  if (!t) return null
  return { text: t, source: text(shelf?.footer) || undefined }
}

export { SEP }
