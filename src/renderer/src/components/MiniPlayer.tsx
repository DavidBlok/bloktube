import { useEffect, useState } from 'react'
import { ListPlus, Maximize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import type { NativeMenuItem } from '@shared/types'
import { blok, errorMessage } from '../api'
import { addToPlaylist, createPlaylist } from '../lib/mutations'
import { queries, queryClient } from '../lib/query'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'
import { Artwork, HeartButton, useArtColor } from './common'
import { useLivePosition } from './PlayerBar'
import { Slider } from './Slider'

export function MiniPlayer() {
  const s = usePlayer((x) => x.state)
  const signedIn = usePlayer((x) => x.auth.status === 'signed-in')
  const message = useUi((x) => x.toast)
  const position = useLivePosition(500)
  const color = useArtColor(s?.thumb, '#282828')
  const [scrub, setScrub] = useState<number | null>(null)
  const has = !!s?.videoId

  useEffect(() => {
    document.title = 'BlokTube Mini Player'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        blok.player.toggle()
      } else if (e.key === 'Escape') blok.app.toggleMini()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`mini platform-${blok.platform}`} style={{ background: `linear-gradient(90deg, ${color} 0%, #181818 85%)` }}>
      <Artwork src={s?.thumb} size={112} className="mini-art" />
      <div className="mini-body">
        <div className="mini-top">
          <div className="mini-meta">
            <div className="mini-title" title={s?.title}>
              {has ? (s!.adPlaying ? 'Advertisement' : s!.title) : 'Nothing playing'}
            </div>
            <div className="mini-artists">{message ? <span className="mini-toast">{message.text}</span> : s?.artists.map((a) => a.name).join(', ')}</div>
          </div>
          <div className="mini-window">
            <button className="icon-btn" onClick={() => blok.app.showMain()} title="Open BlokTube">
              <Maximize2 size={14} />
            </button>
            <button className="icon-btn" onClick={() => blok.app.toggleMini()} title="Close mini player">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mini-controls">
          {has && <HeartButton liked={s!.like === 'LIKE'} onToggle={() => blok.player.toggleLike()} />}
          {has && signedIn && !s!.adPlaying && (
            <button className="icon-btn" onClick={() => pickPlaylist(s!.videoId!)} title="Add to playlist" aria-label="Add to playlist">
              <ListPlus size={17} />
            </button>
          )}
          <button className="icon-btn" onClick={() => blok.player.previous()} title="Previous" disabled={!has}>
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button className="pb-play" onClick={() => blok.player.toggle()} title={s?.playing ? 'Pause' : 'Play'} disabled={!has}>
            {s?.playing ? (
              <Pause size={16} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={16} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />
            )}
          </button>
          <button className="icon-btn" onClick={() => blok.player.next()} title="Next" disabled={!has}>
            <SkipForward size={18} fill="currentColor" />
          </button>
        </div>
        <Slider
          className="mini-progress"
          label="Seek"
          value={scrub ?? position}
          max={s?.duration ?? 0}
          onChange={setScrub}
          onCommit={(v) => {
            setScrub(null)
            blok.player.seek(v)
          }}
        />
      </div>
    </div>
  )
}

async function pickPlaylist(videoId: string) {
  try {
    const own = (await queryClient.ensureQueryData(queries.library())).filter((p) => p.editable)
    const items: NativeMenuItem[] = [{ id: 'new', label: 'New playlist' }, ...(own.length ? [{ separator: true as const }] : []), ...own.map((p) => ({ id: p.id, label: p.title }))]
    const picked = await blok.app.popupMenu(items)
    if (picked === 'new') return createPlaylist([videoId])
    const playlist = own.find((p) => p.id === picked)
    if (playlist) await addToPlaylist(playlist, [videoId])
  } catch (e) {
    toast(errorMessage(e))
  }
}
