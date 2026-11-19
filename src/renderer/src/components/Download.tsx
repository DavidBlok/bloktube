import { ArrowDown, CircleArrowDown } from 'lucide-react'
import type { DownloadStatus } from '@shared/types'
import { confirmRemoveDownload, startDownload, usePlaylistDownload } from '../lib/downloads'

export function DownloadGlyph({ status, progress, size = 14 }: { status: DownloadStatus; progress: number; size?: number }) {
  if (status === 'done') {
    return (
      <span className="dl-done" style={{ width: size, height: size }} title="Downloaded">
        <ArrowDown size={Math.round(size * 0.7)} strokeWidth={3} />
      </span>
    )
  }
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg className={`dl-ring ${status}`} width={size} height={size} viewBox="0 0 24 24" aria-label={`Downloading ${Math.round(progress * 100)}%`}>
      <circle cx="12" cy="12" r={r} className="dl-ring-track" />
      <circle cx="12" cy="12" r={r} className="dl-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, progress))} />
    </svg>
  )
}

export function DownloadButton({ playlistId, title, size = 30 }: { playlistId: string; title: string; size?: number }) {
  const d = usePlaylistDownload(playlistId)
  if (!d) {
    return (
      <button className="icon-btn big" onClick={() => startDownload({ playlistId })} title="Download">
        <CircleArrowDown size={size} />
      </button>
    )
  }
  const label = d.status === 'done' ? 'Remove from Downloads' : `Downloading… ${Math.round(d.progress * 100)}% (click to cancel)`
  return (
    <button className="icon-btn big dl-btn" onClick={() => confirmRemoveDownload({ playlistId }, title)} title={label}>
      <DownloadGlyph status={d.status} progress={d.progress} size={size} />
    </button>
  )
}
