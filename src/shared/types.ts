export interface Ref {
  id: string | null
  name: string
}

export type LikeStatus = 'LIKE' | 'DISLIKE' | 'INDIFFERENT'

export interface PlayTarget {
  videoId?: string
  playlistId?: string
  params?: string
}

export interface Track {
  videoId: string
  title: string
  artists: Ref[]
  album?: Ref | null
  duration?: string
  durationSec?: number
  thumb?: string
  explicit?: boolean
  isVideo?: boolean
  setVideoId?: string
  playlistId?: string
  likeStatus?: LikeStatus
  available?: boolean
  views?: string
  index?: string
  historyToken?: string
  episode?: { description?: string; date?: string; progress?: number }
}

export type YtmSetting =
  | { kind: 'toggle'; id: string; category: string; title: string; summary?: string; value: boolean }
  | { kind: 'choice'; id: string; category: string; title: string; summary?: string; value: string; options: { value: string; label: string }[] }

export interface Uploads {
  tracks: Track[]
  albums: Card[]
}

export interface HistorySection {
  title: string
  tracks: Track[]
}

export type CardKind =
  | 'album'
  | 'artist'
  | 'playlist'
  | 'podcast'
  | 'episode'
  | 'mix'
  | 'song'
  | 'video'
  | 'category'
  | 'unknown'

export interface Card {
  kind: CardKind
  id: string
  title: string
  subtitle: string
  thumb?: string
  play?: PlayTarget
  artists?: Ref[]
  wide?: boolean
  year?: string
  params?: string
  color?: string
  editable?: boolean
}

export type LibraryItem = Card

export interface Shelf {
  title: string
  strapline?: string
  layout: 'tracks' | 'carousel' | 'grid'
  cards: Card[]
  tracks: Track[]
  more?: { browseId: string; params?: string }
}

export interface ShelfPage {
  title?: string
  shelves: Shelf[]
  continuation?: string
}

export interface CollectionPage {
  kind: 'album' | 'playlist' | 'podcast'
  id: string
  title: string
  typeLabel: string
  thumb?: string
  description?: string
  artists: Ref[]
  ownerThumb?: string
  year?: string
  meta: string[]
  play?: PlayTarget
  shuffle?: PlayTarget
  radio?: PlayTarget
  playlistId?: string
  tracks: Track[]
  continuation?: string
  related: Shelf[]
  saved?: boolean
  editable?: boolean
  privacy?: PlaylistPrivacy
}

export type PlaylistPrivacy = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'

export interface PlaylistMove {
  setVideoId: string
  before?: string
}

export interface PlaylistItemRef {
  videoId: string
  setVideoId: string
}

export interface PlaylistEdit {
  title?: string
  description?: string
  privacy?: PlaylistPrivacy
}

export interface ArtistPage {
  id: string
  name: string
  thumb?: string
  description?: string
  subscribers?: string
  channelId?: string
  subscribed?: boolean
  shuffle?: PlayTarget
  radio?: PlayTarget
  topSongs: Track[]
  topSongsPlaylist?: string
  shelves: Shelf[]
}

export type SearchFilter = 'songs' | 'videos' | 'albums' | 'artists' | 'playlists' | 'podcasts'

export interface SearchResults {
  query: string
  filter?: SearchFilter
  top?: Card
  topTracks: Track[]
  shelves: Shelf[]
  tracks: Track[]
  cards: Card[]
  continuation?: string
}

export interface Account {
  name: string
  handle?: string
  thumb?: string
}

export type AuthStatus = 'starting' | 'consent' | 'signing-in' | 'signed-in' | 'signed-out' | 'error'

export interface AuthState {
  status: AuthStatus
  account?: Account
  message?: string
}

export type RepeatMode = 'NONE' | 'ALL' | 'ONE'

export interface PlayerState {
  videoId: string | null
  title: string
  artists: Ref[]
  album: Ref | null
  thumb?: string
  duration: number
  position: number
  buffered: number
  playing: boolean
  buffering: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  like: LikeStatus
  adPlaying: boolean
  isVideo: boolean
}

export interface QueueItem {
  videoId: string
  title: string
  artists: Ref[]
  album: Ref | null
  thumb?: string
  duration?: string
  selected: boolean
}

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed'

export interface DownloadedTrack {
  videoId: string
  title: string
  artists: string
  album?: string
  thumb?: string
  durationSec?: number
  explicit: boolean
  isVideo: boolean
  status: DownloadStatus
  progress: number
  bytes?: number
  individual: boolean
  addedAt?: number
}

export interface DownloadedPlaylist {
  playlistId: string
  title: string
  thumb?: string
  trackIds: string[]
  status: DownloadStatus
  progress: number
}

export interface DownloadsState {
  tracks: DownloadedTrack[]
  playlists: DownloadedPlaylist[]
}

export type DownloadTarget = { videoId: string; playlistId?: undefined } | { playlistId: string; videoId?: undefined }

export interface QueueState {
  items: QueueItem[]
  index: number
  autoplay: QueueItem[]
  autoplayEnabled?: boolean
}

export interface LyricLine {
  time: number
  text: string
}

export interface Lyrics {
  source: string
  synced?: LyricLine[]
  plain?: string
}

type Unsubscribe = () => void

export interface BlokApi {
  platform: string
  auth: {
    get(): Promise<AuthState>
    signIn(): Promise<void>
    signOut(): Promise<void>
    onChange(cb: (s: AuthState) => void): Unsubscribe
  }
  player: {
    play(target: PlayTarget): Promise<boolean>
    playLocal(videoIds: string[]): Promise<boolean>
    playList(videoIds: string[]): Promise<boolean>
    toggle(): Promise<void>
    next(): Promise<void>
    previous(): Promise<void>
    seek(seconds: number): Promise<void>
    setVolume(volume: number): Promise<void>
    toggleMute(): Promise<void>
    toggleShuffle(): Promise<void>
    cycleRepeat(): Promise<void>
    toggleLike(): Promise<void>
    pause(): Promise<void>
    getState(): Promise<PlayerState>
    onState(cb: (s: PlayerState) => void): Unsubscribe
  }
  queue: {
    get(): Promise<QueueState>
    playIndex(index: number): Promise<void>
    add(videoIds: string[], next: boolean): Promise<boolean>
    remove(index: number): Promise<void>
    move(from: number, to: number): Promise<void>
    clear(): Promise<void>
    setAutoplay(enabled: boolean): Promise<void>
    onChange(cb: (q: QueueState) => void): Unsubscribe
  }
  downloads: {
    get(): Promise<DownloadsState>
    add(target: DownloadTarget): Promise<boolean>
    remove(target: DownloadTarget): Promise<boolean>
    clear(): Promise<boolean>
    onChange(cb: (d: DownloadsState) => void): Unsubscribe
  }
  ytm: {
    home(continuation?: string): Promise<ShelfPage>
    browse(browseId: string, params?: string): Promise<ShelfPage>
    moods(): Promise<Card[]>
    search(query: string, filter?: SearchFilter): Promise<SearchResults>
    searchMore(continuation: string, filter: SearchFilter): Promise<SearchResults>
    suggestions(query: string): Promise<string[]>
    collection(browseId: string): Promise<CollectionPage>
    collectionMore(continuation: string): Promise<{ tracks: Track[]; continuation?: string }>
    artist(browseId: string): Promise<ArtistPage>
    library(): Promise<LibraryItem[]>
    lyrics(videoId: string, title: string, artist: string, album: string, duration: number): Promise<Lyrics | null>
    rate(videoId: string, status: LikeStatus, track?: Track): Promise<void>
    saveCollection(playlistId: string, save: boolean): Promise<void>
    subscribe(channelId: string, subscribe: boolean): Promise<void>
    createPlaylist(title: string, videoIds?: string[]): Promise<string>
    addToPlaylist(playlistId: string, videoIds: string[], allowDuplicates?: boolean): Promise<'added' | 'duplicate'>
    removeFromPlaylist(playlistId: string, items: PlaylistItemRef[]): Promise<void>
    movePlaylistItems(playlistId: string, moves: PlaylistMove[]): Promise<void>
    editPlaylist(playlistId: string, edit: PlaylistEdit): Promise<void>
    deletePlaylist(playlistId: string): Promise<void>
    history(): Promise<HistorySection[]>
    uploads(): Promise<Uploads>
    removeFromHistory(tokens: string[]): Promise<void>
    settings(): Promise<YtmSetting[]>
    setSetting(id: string, value: boolean | string): Promise<void>
    color(url: string): Promise<string | null>
  }
  app: {
    showEngine(): Promise<void>
    openExternal(url: string): Promise<void>
    info(): Promise<AppInfo>
    getSettings(): Promise<AppSettings>
    setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
    onSettings(cb: (s: AppSettings) => void): Unsubscribe
    toggleMini(): Promise<void>
    showMain(): Promise<void>
    getSleep(): Promise<SleepTimer>
    setSleep(minutes: number | 'track' | null): Promise<SleepTimer>
    onSleep(cb: (s: SleepTimer) => void): Unsubscribe
  }
}

export interface SleepTimer {
  endsAt: number | null
  endOfTrack: boolean
}

export interface AppSettings {
  tray: boolean
  closeToTray: boolean
  accent: string
  fadeSeconds: number
  openAtLogin?: boolean
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  loginItemSupported: boolean
}
