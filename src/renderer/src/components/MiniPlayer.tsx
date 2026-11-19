import { useEffect, useState } from 'react'
import { Maximize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { blok } from '../api'
import { usePlayer } from '../store/player'
import { Artwork, HeartButton, useArtColor } from './common'
import { useLivePosition } from './PlayerBar'
import { Slider } from './Slider'

export function MiniPlayer() {
  const s = usePlayer((x) => x.state)
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
            <div className="mini-artists">{s?.artists.map((a) => a.name).join(', ')}</div>
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
