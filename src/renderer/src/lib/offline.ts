import { useSyncExternalStore } from 'react'
import type { CollectionPage, DownloadedTrack, DownloadsState, LibraryItem, PlayTarget, Track } from '@shared/types'

export function downloadedToTrack(d: DownloadedTrack): Track {
  return {
    videoId: d.videoId,
    title: d.title,
    artists: d.artists ? [{ id: null, name: d.artists }] : [],
    album: d.album ? { id: null, name: d.album } : null,
    thumb: d.thumb,
    durationSec: d.durationSec,
    duration: d.durationSec ? `${Math.floor(d.durationSec / 60)}:${String(d.durationSec % 60).padStart(2, '0')}` : undefined,
    explicit: d.explicit,
    isVideo: d.isVideo
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export const isOnline = () => navigator.onLine

export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline)
}

export type OfflineRoute = { target: PlayTarget } | { local: string[] } | null

export function offlineRoute(target: PlayTarget, downloads: DownloadsState): OfflineRoute {
  const playlists = downloads.playlists.filter((p) => p.status === 'done')
  if (target.playlistId && playlists.some((p) => p.playlistId === target.playlistId)) return { target }
  if (!target.videoId) return null
  const inPlaylist = playlists.find((p) => p.trackIds.includes(target.videoId!))
  if (inPlaylist) return { target: { videoId: target.videoId, playlistId: inPlaylist.playlistId } }
  if (downloads.tracks.some((t) => t.videoId === target.videoId && t.status === 'done')) return { local: [target.videoId] }
  return null
}

export function localCollection(id: string, downloads: DownloadsState, library?: LibraryItem[]): CollectionPage | undefined {
  const playlistId = id.startsWith('VL') ? id.slice(2) : library?.find((i) => i.id === id)?.play?.playlistId
  const p = playlistId && downloads.playlists.find((x) => x.playlistId === playlistId)
  if (!p) return undefined
  const byId = new Map(downloads.tracks.map((t) => [t.videoId, t]))
  const tracks = p.trackIds.flatMap((v) => {
    const t = byId.get(v)
    return t ? [downloadedToTrack(t)] : []
  })
  const isAlbum = p.playlistId.startsWith('OLAK')
  return {
    kind: isAlbum ? 'album' : 'playlist',
    id,
    title: p.playlistId === 'LM' ? 'Liked Songs' : p.title,
    typeLabel: isAlbum ? 'Album' : 'Playlist',
    thumb: p.thumb,
    artists: [],
    meta: [`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`, 'Downloaded'],
    play: { playlistId: p.playlistId },
    playlistId: p.playlistId,
    tracks,
    related: []
  }
}

export function downloadedLibrary(downloads: DownloadsState): LibraryItem[] {
  return downloads.playlists
    .filter((p) => p.playlistId !== 'LM')
    .map((p) => ({
      kind: p.playlistId.startsWith('OLAK') ? 'album' : 'playlist',
      id: `VL${p.playlistId}`,
      title: p.title,
      subtitle: `${p.trackIds.length} ${p.trackIds.length === 1 ? 'song' : 'songs'}`,
      thumb: p.thumb,
      play: { playlistId: p.playlistId }
    }))
}
