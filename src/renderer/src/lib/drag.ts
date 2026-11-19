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
  const ghost = dragCard(drag.tracks)
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, -12, -12)
  setTimeout(() => ghost.remove(), 0)
}

function dragCard(tracks: Track[]): HTMLElement {
  const [first] = tracks
  const many = tracks.length > 1
  const el = (tag: string, className: string, text?: string) => {
    const node = document.createElement(tag)
    node.className = className
    if (text) node.textContent = text
    return node
  }
  const ghost = el('div', 'drag-ghost')
  const art = el('div', 'drag-ghost-art')
  if (first.thumb) {
    const img = document.createElement('img')
    img.src = first.thumb
    art.appendChild(img)
  }
  if (many) art.appendChild(el('span', 'drag-ghost-count', String(tracks.length)))
  const text = el('div', 'drag-ghost-text')
  text.append(
    el('div', 'drag-ghost-title', many ? `${tracks.length} songs` : first.title),
    el('div', 'drag-ghost-sub', many ? tracks.map((t) => t.title).join(', ') : first.artists.map((a) => a.name).join(', '))
  )
  ghost.append(art, text)
  return ghost
}

export function endTrackDrag() {
  current = null
}
