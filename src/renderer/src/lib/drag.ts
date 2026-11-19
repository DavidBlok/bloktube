import type { DragEvent } from 'react'
import type { Track } from '@shared/types'

export interface TrackDrag {
  tracks: Track[]
  source?: string
}

let current: TrackDrag | null = null

export const getTrackDrag = () => current

export function startTrackDrag(e: DragEvent, drag: TrackDrag) {
  current = drag
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData('text/plain', drag.tracks.map((t) => `https://music.youtube.com/watch?v=${t.videoId}`).join('\n'))
  const ghost = document.createElement('div')
  ghost.className = 'drag-ghost'
  ghost.textContent = drag.tracks.length === 1 ? drag.tracks[0].title : `${drag.tracks.length} songs`
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, -12, -12)
  setTimeout(() => ghost.remove(), 0)
}

export function endTrackDrag() {
  current = null
}
