import type { Engine } from './engine'
import type {
  ArtistPage,
  CollectionPage,
  LibraryItem,
  LikeStatus,
  Lyrics,
  PlayerState,
  PlaylistEdit,
  PlaylistMove,
  PlaylistItemRef,
  SearchFilter,
  Track,
  Uploads
} from '../shared/types'
import {
  hiRes,
  lyricsBrowseId,
  normalizeBrowseId,
  parseArtist,
  parseCollection,
  parseCollectionContinuation,
  parseHistory,
  parseSettings,
  parseUploadedTracks,
  parseLibraryPage,
  parseLyrics,
  parseMoods,
  parseSearch,
  parseShelfPage,
  parseSuggestions,
  SEARCH_PARAMS
} from '../shared/ytm/parse'
import { fetchLrclib } from './lyrics'

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))

const PENDING_MS = 5 * 60_000
const KIND_ORDER = ['playlist', 'album', 'podcast', 'artist']

interface Pending {
  value: boolean
  item?: LibraryItem
  until: number
}

function collectionItem(p: CollectionPage): LibraryItem {
  return {
    kind: p.kind,
    id: p.id,
    title: p.title,
    subtitle: [p.typeLabel, p.artists.map((a) => a.name).join(', ')].filter(Boolean).join(' • '),
    thumb: hiRes(p.thumb, 226),
    artists: p.artists,
    play: p.play ?? (p.playlistId ? { playlistId: p.playlistId } : undefined)
  }
}

function artistItem(p: ArtistPage): LibraryItem {
  return { kind: 'artist', id: p.id, title: p.name, subtitle: p.subscribers ?? '', thumb: hiRes(p.thumb, 226), artists: [] }
}

function playerTrack(s: PlayerState): Track {
  const sec = Math.round(s.duration)
  return {
    videoId: s.videoId!,
    title: s.title,
    artists: s.artists,
    album: s.album,
    thumb: s.thumb,
    duration: sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : undefined,
    durationSec: sec || undefined,
    isVideo: s.isVideo
  }
}

export class Ytm {
  private known = new Map<string, LibraryItem>()
  private pending = new Map<string, Pending>()
  private followed?: { ids: Set<string>; complete: boolean }
  private likes = new Map<string, { status: LikeStatus; track?: Track; until: number }>()
  private likedContinuations = new Set<string>()
  private created = new Map<string, { title: string; until: number }>()
  private player?: PlayerState

  constructor(private engine: Engine) {
    engine.on('player', (s: PlayerState) => (this.player = s))
    engine.on('auth', (s: { status: string }) => {
      if (s.status === 'signed-in') return
      this.known.clear()
      this.pending.clear()
      this.likes.clear()
      this.likedContinuations.clear()
      this.created.clear()
      this.followed = undefined
    })
  }

  private markLike(videoId: string, status: LikeStatus, track?: Track) {
    this.likes.set(videoId, { status, track, until: Date.now() + PENDING_MS })
  }

  private likeOverride(videoId: string): LikeStatus | undefined {
    const p = this.likes.get(videoId)
    if (!p) return undefined
    if (p.until > Date.now()) return p.status
    this.likes.delete(videoId)
    return undefined
  }

  private patchTracks(tracks: Track[]): Track[] {
    if (!this.likes.size) return tracks
    return tracks.map((t) => {
      const s = this.likeOverride(t.videoId)
      return s && s !== t.likeStatus ? { ...t, likeStatus: s } : t
    })
  }

  private patchLiked(tracks: Track[], first: boolean): Track[] {
    const kept = tracks.filter((t) => (this.likeOverride(t.videoId) ?? 'LIKE') === 'LIKE')
    if (!first) return kept
    const added = [...this.likes]
      .filter(([id, p]) => p.track && this.likeOverride(id) === 'LIKE' && !kept.some((t) => t.videoId === id))
      .sort(([, a], [, b]) => b.until - a.until)
      .map(([, p]) => ({ ...p.track!, likeStatus: 'LIKE' as const }))
    return [...added, ...kept]
  }

  noteToggleLike() {
    const s = this.player
    if (!s?.videoId) return
    this.markLike(s.videoId, s.like === 'LIKE' ? 'INDIFFERENT' : 'LIKE', playerTrack(s))
  }

  private f(path: string, body: Record<string, unknown>) {
    return this.engine.fetch(path, clean(body))
  }

  private mark(key: string, value: boolean) {
    this.pending.set(key, { value, item: this.known.get(key), until: Date.now() + PENDING_MS })
  }

  private override(key: string | undefined): boolean | undefined {
    const p = key ? this.pending.get(key) : undefined
    if (!p) return undefined
    if (p.until > Date.now()) return p.value
    this.pending.delete(key!)
    return undefined
  }

  private applyPending(items: LibraryItem[]): LibraryItem[] {
    let out = items
    for (const [key, p] of [...this.pending]) {
      if (this.override(key) === undefined || !p.item) continue
      const id = p.item.id
      const present = out.some((i) => i.id === id)
      if (!p.value && present) out = out.filter((i) => i.id !== id)
      else if (p.value && !present) {
        const rank = KIND_ORDER.indexOf(p.item.kind)
        const at = out.findIndex((i) => KIND_ORDER.indexOf(i.kind) >= rank)
        out = at < 0 ? [...out, p.item] : [...out.slice(0, at), p.item, ...out.slice(at)]
      }
    }
    return out
  }

  async home(continuation?: string) {
    return parseShelfPage(await this.f('/browse', continuation ? { continuation } : { browseId: 'FEmusic_home' }))
  }

  async browse(browseId: string, params?: string) {
    return parseShelfPage(await this.f('/browse', { browseId, params }))
  }

  async moods() {
    return parseMoods(await this.f('/browse', { browseId: 'FEmusic_moods_and_genres' }))
  }

  async search(query: string, filter?: SearchFilter) {
    const params = filter ? SEARCH_PARAMS[filter] : undefined
    const res = parseSearch(await this.f('/search', { query, params }), query, filter)
    return { ...res, topTracks: this.patchTracks(res.topTracks), tracks: this.patchTracks(res.tracks) }
  }

  async searchMore(continuation: string, filter: SearchFilter) {
    const res = parseSearch(await this.f('/search', { continuation }), '', filter)
    return { ...res, topTracks: this.patchTracks(res.topTracks), tracks: this.patchTracks(res.tracks) }
  }

  async suggestions(input: string) {
    return parseSuggestions(await this.f('/music/get_search_suggestions', { input }))
  }

  async collection(browseId: string) {
    const page = parseCollection(await this.f('/browse', { browseId }), browseId)
    const created = this.created.get(browseId)
    if (created && created.until > Date.now() && (!page.title || !page.editable)) {
      page.title ||= created.title
      page.typeLabel ||= 'Playlist'
      page.editable = true
    }
    if (page.playlistId) {
      this.known.set(page.playlistId, collectionItem(page))
      page.saved = this.override(page.playlistId) ?? page.saved
    }
    page.tracks = this.patchTracks(page.tracks)
    if (browseId === 'VLLM') {
      page.tracks = this.patchLiked(page.tracks, true)
      if (page.continuation) this.likedContinuations.add(page.continuation)
    }
    return page
  }

  async collectionMore(continuation: string) {
    const res = parseCollectionContinuation(await this.f('/browse', { continuation }))
    res.tracks = this.patchTracks(res.tracks)
    if (this.likedContinuations.has(continuation)) {
      res.tracks = this.patchLiked(res.tracks, false)
      if (res.continuation) this.likedContinuations.add(res.continuation)
    }
    return res
  }

  async artist(browseId: string) {
    const id = normalizeBrowseId(browseId)
    const page = parseArtist(await this.f('/browse', { browseId: id }), id)
    if (page.channelId) {
      this.known.set(page.channelId, artistItem(page))
      const pending = this.override(page.channelId)
      if (pending !== undefined) page.subscribed = pending
      else if (this.followed?.ids.has(page.id)) page.subscribed = true
      else if (this.followed?.complete) page.subscribed = false
    }
    page.topSongs = this.patchTracks(page.topSongs)
    return page
  }

  private async libraryList(browseId: string, maxPages = 10): Promise<{ items: LibraryItem[]; complete: boolean }> {
    const items: LibraryItem[] = []
    let page = parseLibraryPage(await this.f('/browse', { browseId }))
    items.push(...page.items)
    for (let i = 0; i < maxPages && page.continuation; i++) {
      page = parseLibraryPage(await this.f('/browse', { continuation: page.continuation }))
      items.push(...page.items)
    }
    return { items, complete: !page.continuation }
  }

  private async libraryListRetry(browseId: string) {
    await new Promise((r) => setTimeout(r, 1500))
    return this.libraryList(browseId)
  }

  async library(): Promise<LibraryItem[]> {
    if (this.engine.auth.status !== 'signed-in') return []
    const none = { items: [], complete: false }
    const [playlists, albums, podcasts, artists] = await Promise.all([
      this.libraryList('FEmusic_liked_playlists').catch(() => this.libraryListRetry('FEmusic_liked_playlists')),
      this.libraryList('FEmusic_liked_albums').catch(() => this.libraryListRetry('FEmusic_liked_albums')),
      this.libraryList('FEmusic_library_non_music_audio_list').catch(() => none),
      this.libraryList('FEmusic_library_corpus_artists').catch(() => undefined)
    ])
    const seen = new Set<string>()
    const shows = podcasts.items.filter((i) => i.kind === 'podcast')
    const items = [...playlists.items, ...albums.items, ...shows, ...(artists?.items ?? [])].filter((it) => {
      if (it.id === 'VLLM' || seen.has(it.id)) return false
      seen.add(it.id)
      return true
    })
    const result = this.applyPending(items)
    if (artists) {
      const ids = new Set(result.filter((i) => i.kind === 'artist').map((i) => i.id))
      this.followed = { ids, complete: artists.complete }
    }
    return result
  }

  async lyrics(videoId: string, title: string, artist: string, album: string, duration: number): Promise<Lyrics | null> {
    const synced = await fetchLrclib(title, artist, album, duration).catch(() => null)
    if (synced?.synced?.length) return synced
    try {
      const id = lyricsBrowseId(await this.f('/next', { videoId }))
      if (id) {
        const yt = parseLyrics(await this.f('/browse', { browseId: id }))
        if (yt) return { source: yt.source ?? 'YouTube Music', plain: yt.text }
      }
    } catch {
      /* fall through */
    }
    return synced
  }

  async rate(videoId: string, status: LikeStatus, track?: Track) {
    const path = status === 'LIKE' ? '/like/like' : status === 'DISLIKE' ? '/like/dislike' : '/like/removelike'
    await this.f(path, { target: { videoId } })
    this.markLike(videoId, status, track)
  }

  async saveCollection(playlistId: string, save: boolean) {
    await this.f(save ? '/like/like' : '/like/removelike', { target: { playlistId } })
    this.mark(playlistId, save)
  }

  async subscribe(channelId: string, subscribe: boolean) {
    await this.f(subscribe ? '/subscription/subscribe' : '/subscription/unsubscribe', { channelIds: [channelId] })
    this.mark(channelId, subscribe)
  }

  private async editPlaylistActions(playlistId: string, actions: Record<string, unknown>[]) {
    return (await this.f('/browse/edit_playlist', { playlistId, actions })) as { status?: string }
  }

  async createPlaylist(title: string, videoIds: string[] = []): Promise<string> {
    const res = (await this.f('/playlist/create', { title, privacyStatus: 'PRIVATE', videoIds })) as { playlistId?: string }
    if (!res.playlistId) throw new Error('Could not create the playlist')
    const id = `VL${res.playlistId}`
    const until = Date.now() + PENDING_MS
    this.created.set(id, { title, until })
    const subtitle = [this.engine.auth.account?.name, `${videoIds.length} ${videoIds.length === 1 ? 'track' : 'tracks'}`].filter(Boolean).join(' • ')
    const item: LibraryItem = { kind: 'playlist', id, title, subtitle, editable: true, play: { playlistId: res.playlistId } }
    this.pending.set(res.playlistId, { value: true, item, until })
    return res.playlistId
  }

  async addToPlaylist(playlistId: string, videoIds: string[], allowDuplicates = false): Promise<'added' | 'duplicate'> {
    const dedupeOption = allowDuplicates ? 'DEDUPE_OPTION_SKIP' : 'DEDUPE_OPTION_CHECK'
    const res = await this.editPlaylistActions(
      playlistId,
      videoIds.map((addedVideoId) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId, dedupeOption }))
    )
    if (res.status === 'STATUS_SUCCEEDED') return 'added'
    if (!allowDuplicates && JSON.stringify(res).includes('DEDUPE_OPTION_SKIP')) return 'duplicate'
    throw new Error('Could not add to the playlist')
  }

  async removeFromPlaylist(playlistId: string, items: PlaylistItemRef[]) {
    const res = await this.editPlaylistActions(
      playlistId,
      items.map((i) => ({ action: 'ACTION_REMOVE_VIDEO', setVideoId: i.setVideoId, removedVideoId: i.videoId }))
    )
    if (res.status !== 'STATUS_SUCCEEDED') throw new Error('Could not remove from the playlist')
  }

  async movePlaylistItems(playlistId: string, moves: PlaylistMove[]) {
    if (!moves.length) return
    const res = await this.editPlaylistActions(
      playlistId,
      moves.map((m) => ({ action: 'ACTION_MOVE_VIDEO_BEFORE', setVideoId: m.setVideoId, ...(m.before && { movedSetVideoIdSuccessor: m.before }) }))
    )
    if (res.status !== 'STATUS_SUCCEEDED') throw new Error('Could not move the songs')
  }

  async editPlaylist(playlistId: string, edit: PlaylistEdit) {
    const actions: Record<string, unknown>[] = []
    if (edit.title !== undefined) actions.push({ action: 'ACTION_SET_PLAYLIST_NAME', playlistName: edit.title })
    if (edit.description !== undefined) actions.push({ action: 'ACTION_SET_PLAYLIST_DESCRIPTION', playlistDescription: edit.description })
    if (edit.privacy !== undefined) actions.push({ action: 'ACTION_SET_PLAYLIST_PRIVACY', playlistPrivacy: edit.privacy })
    if (!actions.length) return
    const res = await this.editPlaylistActions(playlistId, actions)
    if (res.status !== 'STATUS_SUCCEEDED') throw new Error('Could not update the playlist')
    const created = this.created.get(`VL${playlistId}`)
    if (created && edit.title !== undefined) created.title = edit.title
    const pending = this.pending.get(playlistId)
    if (pending?.item && edit.title !== undefined) pending.item = { ...pending.item, title: edit.title }
  }

  async history() {
    const sections = parseHistory(await this.f('/browse', { browseId: 'FEmusic_history' }))
    return sections.map((s) => ({ ...s, tracks: this.patchTracks(s.tracks) }))
  }

  async uploads(): Promise<Uploads> {
    if (this.engine.auth.status !== 'signed-in') return { tracks: [], albums: [] }
    const [songs, albums] = await Promise.all([
      (async () => {
        let page = parseUploadedTracks(await this.f('/browse', { browseId: 'FEmusic_library_privately_owned_tracks' }))
        const tracks = [...page.tracks]
        for (let i = 0; i < 20 && page.continuation; i++) {
          page = parseUploadedTracks(await this.f('/browse', { continuation: page.continuation }))
          tracks.push(...page.tracks)
        }
        return tracks
      })(),
      this.libraryList('FEmusic_library_privately_owned_releases').then((r) => r.items)
    ])
    return { tracks: this.patchTracks(songs), albums }
  }

  async removeFromHistory(tokens: string[]) {
    await this.f('/feedback', { feedbackTokens: tokens })
  }

  async settings() {
    return parseSettings(await this.f('/account/get_setting', {}))
  }

  async setSetting(id: string, value: boolean | string) {
    const newValue = typeof value === 'boolean' ? { boolValue: value } : { intValue: value }
    await this.f('/account/set_setting', { settingItemId: id, newValue })
  }

  async deletePlaylist(playlistId: string) {
    await this.f('/playlist/delete', { playlistId })
    const id = `VL${playlistId}`
    this.created.delete(id)
    const item = this.known.get(playlistId) ?? { kind: 'playlist', id, title: '', subtitle: '' }
    this.pending.set(playlistId, { value: false, item, until: Date.now() + PENDING_MS })
  }
}
