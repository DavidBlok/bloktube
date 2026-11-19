import { useMutation } from '@tanstack/react-query'
import type { LibraryItem, LikeStatus, PlaylistEdit, PlaylistPrivacy, Track } from '@shared/types'
import { blok, errorMessage } from '../api'
import { useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'
import { queries, queryClient, refreshLikedSongs, setTrackLike, snapshotTrackQueries } from './query'

export interface PlaylistRef {
  id: string
  title: string
}

const libraryKey = () => queries.library().queryKey
const collectionKey = (id: string) => queries.collection(id).queryKey
const playlistIdOf = (id: string) => id.replace(/^VL/, '')

export function ownPlaylists(): LibraryItem[] {
  return (queryClient.getQueryData(libraryKey()) ?? []).filter((i) => i.editable)
}

async function nextPlaylistName(): Promise<string> {
  const own = (await queryClient.ensureQueryData(queries.library())).filter((i) => i.editable)
  const titles = new Set(own.map((p) => p.title))
  let n = own.length + 1
  while (titles.has(`My Playlist #${n}`)) n++
  return `My Playlist #${n}`
}

export async function createPlaylist(videoIds: string[] = [], open = videoIds.length === 0) {
  try {
    const title = await nextPlaylistName()
    const playlistId = await blok.ytm.createPlaylist(title, videoIds)
    await queryClient.invalidateQueries({ queryKey: libraryKey() })
    if (open) useNav.getState().go({ name: 'collection', id: `VL${playlistId}` })
    else toast(`Added to ${title}`)
  } catch (e) {
    toast(errorMessage(e))
  }
}

export async function addToPlaylist(playlist: PlaylistRef, videoIds: string[], allowDuplicates = false) {
  try {
    const res = await blok.ytm.addToPlaylist(playlistIdOf(playlist.id), videoIds, allowDuplicates)
    if (res === 'duplicate') {
      if (location.hash === '#mini') {
        const again = await blok.app.confirm({ title: 'Already added', message: `This is already in your ${playlist.title} playlist.`, confirmLabel: 'Add anyway' })
        if (again) await addToPlaylist(playlist, videoIds, true)
        return
      }
      useUi.getState().openDialog({
        kind: 'confirm',
        title: 'Already added',
        message: (
          <>
            This is already in your <strong>{playlist.title}</strong> playlist.
          </>
        ),
        confirmLabel: 'Add anyway',
        onConfirm: () => addToPlaylist(playlist, videoIds, true)
      })
      return
    }
    toast(`Added to ${playlist.title}`)
    queryClient.invalidateQueries({ queryKey: collectionKey(playlist.id) })
    queryClient.invalidateQueries({ queryKey: libraryKey() })
  } catch (e) {
    toast(errorMessage(e))
  }
}

export async function removeFromPlaylist(playlist: PlaylistRef, tracks: Track | Track[]) {
  const items = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => t.setVideoId)
  if (!items.length) return
  const ids = new Set(items.map((t) => t.setVideoId))
  const key = collectionKey(playlist.id)
  await queryClient.cancelQueries({ queryKey: key })
  const prev = queryClient.getQueryData(key)
  queryClient.setQueryData(key, (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, tracks: p.tracks.filter((t) => !ids.has(t.setVideoId)) })) })
  try {
    await blok.ytm.removeFromPlaylist(
      playlistIdOf(playlist.id),
      items.map((t) => ({ videoId: t.videoId, setVideoId: t.setVideoId! }))
    )
    toast(items.length === 1 ? `Removed from ${playlist.title}` : `Removed ${items.length} songs from ${playlist.title}`)
    queryClient.invalidateQueries({ queryKey: key })
    queryClient.invalidateQueries({ queryKey: libraryKey() })
  } catch (e) {
    if (prev) queryClient.setQueryData(key, prev)
    toast(errorMessage(e))
  }
}

export async function movePlaylistItems(playlist: PlaylistRef, moved: Track[], before: Track | null) {
  const ids = new Set(moved.map((t) => t.setVideoId).filter(Boolean))
  if (!ids.size || (before?.setVideoId && ids.has(before.setVideoId))) return
  const key = collectionKey(playlist.id)
  await queryClient.cancelQueries({ queryKey: key })
  const prev = queryClient.getQueryData(key)
  if (!prev) return
  const all = prev.pages.flatMap((p) => p.tracks)
  const moving = all.filter((t) => ids.has(t.setVideoId))
  const rest = all.filter((t) => !ids.has(t.setVideoId))
  const at = before ? rest.findIndex((t) => t.setVideoId === before.setVideoId) : rest.length
  if (at < 0) return
  const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)]
  if (next.every((t, i) => t === all[i])) return
  let offset = 0
  queryClient.setQueryData(key, {
    ...prev,
    pages: prev.pages.map((p) => {
      const tracks = next.slice(offset, offset + p.tracks.length)
      offset += p.tracks.length
      return { ...p, tracks }
    })
  })
  try {
    const target = before?.setVideoId
    await blok.ytm.movePlaylistItems(
      playlistIdOf(playlist.id),
      moving.map((t) => ({ setVideoId: t.setVideoId!, before: target }))
    )
  } catch (e) {
    queryClient.setQueryData(key, prev)
    toast(errorMessage(e))
  }
}

export async function setPlaylistPrivacy(playlist: PlaylistRef, privacy: PlaylistPrivacy) {
  const key = collectionKey(playlist.id)
  const prev = queryClient.getQueryData(key)
  queryClient.setQueryData(key, (d) => d && { ...d, pages: d.pages.map((p, i) => (i === 0 && p.page ? { ...p, page: { ...p.page, privacy } } : p)) })
  try {
    await blok.ytm.editPlaylist(playlistIdOf(playlist.id), { privacy })
    toast(privacy === 'PUBLIC' ? 'Playlist is now public' : privacy === 'UNLISTED' ? 'Playlist is now unlisted' : 'Playlist is now private')
  } catch (e) {
    if (prev) queryClient.setQueryData(key, prev)
    toast(errorMessage(e))
  }
}

export function useEditPlaylist(id: string) {
  return useMutation({
    mutationFn: (edit: PlaylistEdit) => blok.ytm.editPlaylist(playlistIdOf(id), edit),
    onSuccess: (_d, edit) => {
      queryClient.setQueryData(collectionKey(id), (d) =>
        d && { ...d, pages: d.pages.map((p, i) => (i === 0 && p.page ? { ...p, page: { ...p.page, ...edit } } : p)) }
      )
      queryClient.invalidateQueries({ queryKey: collectionKey(id) })
      queryClient.invalidateQueries({ queryKey: libraryKey() })
    },
    onError: (e) => toast(errorMessage(e))
  })
}

export function openEditPlaylist(p: { id: string; title: string; description?: string; thumb?: string }) {
  useUi.getState().openDialog({ kind: 'editPlaylist', ...p })
}

export function confirmDeletePlaylist(playlist: PlaylistRef) {
  useUi.getState().openDialog({
    kind: 'confirm',
    title: 'Delete from Your Library?',
    message: (
      <>
        This will delete <strong>{playlist.title}</strong> from Your Library.
      </>
    ),
    confirmLabel: 'Delete',
    onConfirm: () => deletePlaylist(playlist)
  })
}

async function deletePlaylist(playlist: PlaylistRef) {
  try {
    await blok.ytm.deletePlaylist(playlistIdOf(playlist.id))
    const nav = useNav.getState()
    const route = nav.stack[nav.index]
    if (route.name === 'collection' && route.id === playlist.id) nav.go({ name: 'home' })
    queryClient.removeQueries({ queryKey: collectionKey(playlist.id) })
    await queryClient.invalidateQueries({ queryKey: libraryKey() })
    toast('Removed from Your Library')
  } catch (e) {
    toast(errorMessage(e))
  }
}

export async function rateTrack(track: Track, status: LikeStatus): Promise<boolean> {
  const now = usePlayer.getState().state
  const viaPlayer = now?.videoId === track.videoId && status !== 'DISLIKE' && (now.like === 'LIKE') !== (status === 'LIKE')
  const snapshot = snapshotTrackQueries()
  setTrackLike(track.videoId, status)
  try {
    if (viaPlayer) await blok.player.toggleLike()
    else {
      await blok.ytm.rate(track.videoId, status, track)
      refreshLikedSongs()
    }
    toast(status === 'LIKE' ? 'Added to Liked Songs' : 'Removed from Liked Songs')
    return true
  } catch (e) {
    for (const [key, data] of snapshot) queryClient.setQueryData(key, data)
    toast(errorMessage(e))
    return false
  }
}

export function useSaveCollection(id: string) {
  const key = queries.collection(id).queryKey
  return useMutation({
    mutationFn: ({ playlistId, save }: { playlistId: string; save: boolean }) => blok.ytm.saveCollection(playlistId, save),
    onMutate: async ({ save }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (d) =>
        d && { ...d, pages: d.pages.map((p, i) => (i === 0 && p.page ? { ...p, page: { ...p.page, saved: save } } : p)) }
      )
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
      toast(errorMessage(e))
    },
    onSuccess: (_d, { save }) => toast(save ? 'Saved to Your Library' : 'Removed from Your Library'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queries.library().queryKey })
  })
}

export function useFollowArtist(id: string) {
  const key = queries.artist(id).queryKey
  return useMutation({
    mutationFn: ({ channelId, follow }: { channelId: string; follow: boolean; name: string }) => blok.ytm.subscribe(channelId, follow),
    onMutate: async ({ follow }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (d) => d && { ...d, subscribed: follow })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev)
      toast(errorMessage(e))
    },
    onSuccess: (_d, { follow, name }) => toast(follow ? `Following ${name}` : `Unfollowed ${name}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queries.library().queryKey })
  })
}

export async function removeFromHistory(track: Track) {
  const token = track.historyToken
  if (!token) return
  const key = queries.history().queryKey
  await queryClient.cancelQueries({ queryKey: key })
  const prev = queryClient.getQueryData(key)
  queryClient.setQueryData(key, (d) =>
    d?.map((s) => ({ ...s, tracks: s.tracks.filter((t) => t.historyToken !== token) })).filter((s) => s.tracks.length)
  )
  try {
    await blok.ytm.removeFromHistory([token])
    toast('Removed from history')
  } catch (e) {
    if (prev) queryClient.setQueryData(key, prev)
    toast(errorMessage(e))
  }
}
