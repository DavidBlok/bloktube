import { CircleArrowDown, CircleMinus, Disc3, Heart, Link, ListEnd, ListMusic, ListPlus, ListStart, Pencil, Plus, Radio, Trash2, User } from 'lucide-react'
import type { Card, Track } from '@shared/types'
import { confirmRemoveDownload, isIndividualDownload, playlistIdOfCard, startDownload } from './downloads'
import { openAlbum, openArtist } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, type MenuItem } from '../store/ui'
import {
  addToPlaylist,
  confirmDeletePlaylist,
  createPlaylist,
  openEditPlaylist,
  ownPlaylists,
  rateTrack,
  removeFromPlaylist,
  type PlaylistRef
} from './mutations'

export const radioForTrack = (videoId: string) => ({ videoId, playlistId: `RDAMVM${videoId}`, params: 'wAEB' })

export function copy(text: string, message = 'Link copied to clipboard') {
  navigator.clipboard
    .writeText(text)
    .then(() => toast(message))
    .catch(() => toast('Could not copy link'))
}

function playlistItems(videoIds: string[]): MenuItem[] {
  if (usePlayer.getState().auth.status !== 'signed-in') return []
  const own = ownPlaylists()
  return [
    {
      label: 'Add to playlist',
      icon: <ListPlus size={16} />,
      submenu: [
        { label: 'New playlist', icon: <Plus size={16} />, onClick: () => createPlaylist(videoIds) },
        ...(own.length ? [{ label: '', divider: true }] : []),
        ...own.map((p) => ({ label: p.title, icon: <ListMusic size={16} />, onClick: () => addToPlaylist(p, videoIds) }))
      ]
    }
  ]
}

function downloadItem(videoId: string, title: string): MenuItem[] {
  const { auth, downloads } = usePlayer.getState()
  if (auth.status !== 'signed-in') return []
  if (isIndividualDownload(videoId)) {
    return [{ label: 'Remove download', icon: <CircleArrowDown size={16} />, onClick: () => confirmRemoveDownload({ videoId }, title) }]
  }
  if (downloads.tracks.some((t) => t.videoId === videoId)) return []
  return [{ label: 'Download', icon: <CircleArrowDown size={16} />, onClick: () => startDownload({ videoId }) }]
}

export function trackMenu(track: Track, opts: { onRemove?: () => void; playlist?: PlaylistRef; extra?: MenuItem[] } = {}): MenuItem[] {
  const { addToQueue, play } = usePlayer.getState()
  const liked = track.likeStatus === 'LIKE'
  const playlist = opts.playlist
  const items: MenuItem[] = [
    ...playlistItems([track.videoId]),
    ...(playlist && track.setVideoId
      ? [{ label: 'Remove from this playlist', icon: <CircleMinus size={16} />, onClick: () => removeFromPlaylist(playlist, track) }]
      : []),
    { label: '', divider: true },
    { label: 'Add to queue', icon: <ListEnd size={16} />, onClick: () => addToQueue([track.videoId], false) },
    { label: 'Play next', icon: <ListStart size={16} />, onClick: () => addToQueue([track.videoId], true) },
    { label: 'Go to song radio', icon: <Radio size={16} />, onClick: () => play(radioForTrack(track.videoId), null) },
    { label: '', divider: true }
  ]
  const artist = track.artists.find((a) => a.id)
  if (artist) items.push({ label: 'Go to artist', icon: <User size={16} />, onClick: () => openArtist(artist.id) })
  if (track.album?.id) {
    const podcast = track.album.id.startsWith('MPSP')
    items.push({ label: podcast ? 'Go to podcast' : 'Go to album', icon: <Disc3 size={16} />, onClick: () => openAlbum(track.album!.id) })
  }
  items.push(
    { label: '', divider: true },
    {
      label: liked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs',
      icon: <Heart size={16} fill={liked ? 'currentColor' : 'none'} />,
      onClick: () => rateTrack(track, liked ? 'INDIFFERENT' : 'LIKE')
    },
    ...downloadItem(track.videoId, track.title),
    { label: 'Copy song link', icon: <Link size={16} />, onClick: () => copy(`https://music.youtube.com/watch?v=${track.videoId}`) }
  )
  if (opts.onRemove) items.push({ label: 'Remove from queue', icon: <ListEnd size={16} />, onClick: opts.onRemove })
  if (opts.extra?.length) items.push({ label: '', divider: true }, ...opts.extra)
  return items
}

export function tracksMenu(tracks: Track[], opts: { playlist?: PlaylistRef } = {}): MenuItem[] {
  const { addToQueue } = usePlayer.getState()
  const videoIds = [...new Set(tracks.map((t) => t.videoId))]
  const removable = opts.playlist ? tracks.filter((t) => t.setVideoId) : []
  const unliked = tracks.filter((t) => t.likeStatus !== 'LIKE')
  return [
    ...playlistItems(videoIds),
    ...(opts.playlist && removable.length
      ? [{ label: 'Remove from this playlist', icon: <CircleMinus size={16} />, onClick: () => removeFromPlaylist(opts.playlist!, removable) }]
      : []),
    { label: '', divider: true },
    { label: 'Add to queue', icon: <ListEnd size={16} />, onClick: () => addToQueue(videoIds, false) },
    { label: 'Play next', icon: <ListStart size={16} />, onClick: () => addToQueue(videoIds, true) },
    ...(unliked.length && usePlayer.getState().auth.status === 'signed-in'
      ? [
          { label: '', divider: true },
          {
            label: 'Save to your Liked Songs',
            icon: <Heart size={16} />,
            onClick: () => {
              for (const t of unliked) rateTrack(t, 'LIKE')
            }
          }
        ]
      : [])
  ]
}

export function cardUrl(card: Card): string {
  if (card.kind === 'song' || card.kind === 'video') return `https://music.youtube.com/watch?v=${card.id}`
  if (card.kind === 'playlist' || card.kind === 'mix') return `https://music.youtube.com/playlist?list=${card.id.replace(/^VL/, '')}`
  if (card.kind === 'artist') return `https://music.youtube.com/channel/${card.id}`
  return `https://music.youtube.com/browse/${card.id}`
}

export function cardMenu(card: Card): MenuItem[] {
  const { play } = usePlayer.getState()
  const items: MenuItem[] = []
  if (card.play) items.push({ label: 'Play', icon: <ListStart size={16} />, onClick: () => play(card.play, { id: card.id, title: card.title }) })
  if (card.kind === 'song' || card.kind === 'video') {
    items.push(
      ...playlistItems([card.id]),
      { label: 'Add to queue', icon: <ListEnd size={16} />, onClick: () => usePlayer.getState().addToQueue([card.id], false) },
      { label: 'Go to song radio', icon: <Radio size={16} />, onClick: () => play(radioForTrack(card.id), null) },
      ...downloadItem(card.id, card.title)
    )
  }
  const { auth, downloads } = usePlayer.getState()
  const downloadable = card.kind === 'playlist' || (card.kind === 'album' && !!card.play?.playlistId)
  if (downloadable && auth.status === 'signed-in') {
    const playlistId = playlistIdOfCard(card)
    const icon = <CircleArrowDown size={16} />
    items.push(
      downloads.playlists.some((p) => p.playlistId === playlistId)
        ? { label: 'Remove from Downloads', icon, onClick: () => confirmRemoveDownload({ playlistId }, card.title) }
        : { label: 'Download', icon, onClick: () => startDownload({ playlistId }) }
    )
  }
  const artist = card.artists?.find((a) => a.id)
  if (artist && card.kind !== 'artist') items.push({ label: 'Go to artist', icon: <User size={16} />, onClick: () => openArtist(artist.id) })
  if (card.kind !== 'category') items.push({ label: 'Copy link', icon: <Link size={16} />, onClick: () => copy(cardUrl(card)) })
  if (card.editable) {
    items.push(
      { label: '', divider: true },
      { label: 'Edit details', icon: <Pencil size={16} />, onClick: () => openEditPlaylist({ id: card.id, title: card.title, thumb: card.thumb }) },
      { label: 'Delete', icon: <Trash2 size={16} />, onClick: () => confirmDeletePlaylist(card) }
    )
  }
  return items
}
