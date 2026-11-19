import { create } from 'zustand'
import type { AuthState, DownloadsState, PlayTarget, PlayerState, QueueState, SleepTimer } from '@shared/types'
import { blok, errorMessage } from '../api'
import { isOnline, offlineRoute, type OfflineRoute } from '../lib/offline'
import { queries, queryClient, refreshLikedSongs, setTrackLike } from '../lib/query'
import { toast } from './ui'

export interface PlayContext {
  id: string
  title: string
}

interface PlayerStore {
  state: PlayerState | null
  stamp: number
  queue: QueueState
  auth: AuthState
  context: PlayContext | null
  downloads: DownloadsState
  sleep: SleepTimer
  play: (target: PlayTarget | undefined, context?: PlayContext | null) => Promise<void>
  playLocal: (videoIds: string[], context?: PlayContext | null) => Promise<void>
  addToQueue: (videoIds: string[], next: boolean, at?: number) => Promise<void>
}

const EMPTY_QUEUE: QueueState = { items: [], index: -1, autoplay: [] }

export const usePlayer = create<PlayerStore>((set, get) => ({
  state: null,
  stamp: 0,
  queue: EMPTY_QUEUE,
  auth: { status: 'starting' },
  context: null,
  downloads: { tracks: [], playlists: [] },
  sleep: { endsAt: null, endOfTrack: false },

  async play(target, context) {
    if (!target || (!target.videoId && !target.playlistId)) return
    let route: OfflineRoute = { target }
    if (!isOnline()) {
      route = offlineRoute(target, get().downloads)
      if (!route) {
        toast('You’re offline. Only downloaded music can play.')
        return
      }
    }
    if (context !== undefined) set({ context })
    try {
      if ('local' in route) await blok.player.playLocal(route.local)
      else await blok.player.play(route.target)
    } catch (e) {
      toast(errorMessage(e))
    }
  },

  async playLocal(videoIds, context) {
    if (!videoIds.length) return
    if (context !== undefined) set({ context })
    try {
      await blok.player.playLocal(videoIds)
    } catch (e) {
      toast(errorMessage(e))
    }
  },

  async addToQueue(videoIds, next, at) {
    try {
      const ok = await blok.queue.add(videoIds, next, at)
      if (ok) toast(next ? 'Playing next' : 'Added to queue')
      else {
        await get().play({ videoId: videoIds[0] }, null)
      }
    } catch (e) {
      toast(errorMessage(e))
    }
  }
}))

export function livePosition(state: PlayerState | null, stamp: number, now = performance.now()): number {
  if (!state) return 0
  let pos = state.position
  if (state.playing && !state.buffering) pos += (now - stamp) / 1000
  return Math.min(pos, state.duration || pos)
}

export function initPlayerBindings() {
  blok.player.onState((state) => {
    const prev = usePlayer.getState().state
    usePlayer.setState({ state, stamp: performance.now() })
    if (state.videoId && prev?.videoId === state.videoId && prev.like !== state.like) {
      setTrackLike(state.videoId, state.like)
      refreshLikedSongs()
    }
  })
  blok.queue.onChange((queue) => usePlayer.setState({ queue }))
  blok.downloads.onChange((downloads) => usePlayer.setState({ downloads }))
  blok.app.onSleep((sleep) => usePlayer.setState({ sleep }))
  blok.app
    .getSleep()
    .then((sleep) => usePlayer.setState({ sleep }))
    .catch(() => undefined)
  blok.downloads
    .get()
    .then((downloads) => downloads && usePlayer.setState({ downloads }))
    .catch(() => undefined)
  blok.auth.onChange((auth) => {
    const prev = usePlayer.getState().auth.status
    usePlayer.setState({ auth })
    if (prev === 'starting' || (prev === 'signed-in') === (auth.status === 'signed-in')) return
    queryClient.removeQueries({ queryKey: queries.library().queryKey })
    queryClient.invalidateQueries()
  })
  blok.auth.get().then((auth) => usePlayer.setState({ auth }))
  blok.ytm.onPlaylistChanged((id) => {
    queryClient.invalidateQueries({ queryKey: queries.library().queryKey })
    queryClient.invalidateQueries({ queryKey: queries.collection(`VL${id}`).queryKey })
  })
  blok.queue
    .get()
    .then((queue) => usePlayer.setState({ queue }))
    .catch(() => undefined)
  blok.player
    .getState()
    .then((state) => {
      if (state?.videoId && !usePlayer.getState().state) usePlayer.setState({ state, stamp: performance.now() })
    })
    .catch(() => undefined)
}
