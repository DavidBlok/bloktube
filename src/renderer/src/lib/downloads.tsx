import type { Card, DownloadTarget } from '@shared/types'
import { blok, errorMessage } from '../api'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'

export const playlistIdOfCard = (card: Pick<Card, 'id' | 'play'>) => card.play?.playlistId ?? card.id.replace(/^VL/, '')

export function useTrackDownload(videoId: string | undefined) {
  return usePlayer((s) => (videoId ? s.downloads.tracks.find((t) => t.videoId === videoId) : undefined))
}

export function usePlaylistDownload(playlistId: string | undefined) {
  return usePlayer((s) => (playlistId ? s.downloads.playlists.find((p) => p.playlistId === playlistId) : undefined))
}

export function isIndividualDownload(videoId: string) {
  return usePlayer.getState().downloads.tracks.some((t) => t.videoId === videoId && t.individual)
}

export async function startDownload(target: DownloadTarget) {
  try {
    if (await blok.downloads.add(target)) toast('Downloading…')
    else toast('This can’t be downloaded')
  } catch (e) {
    toast(errorMessage(e))
  }
}

export function confirmRemoveDownload(target: DownloadTarget, title: string) {
  useUi.getState().openDialog({
    kind: 'confirm',
    title: 'Remove from Downloads?',
    message: (
      <>
        You won’t be able to play <strong>{title}</strong> offline.
      </>
    ),
    confirmLabel: 'Remove',
    onConfirm: async () => {
      try {
        if (await blok.downloads.remove(target)) toast('Removed from Downloads')
        else toast('Could not remove the download')
      } catch (e) {
        toast(errorMessage(e))
      }
    }
  })
}
