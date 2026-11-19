import { useEffect, useRef, useState } from 'react'
import {
  ListMusic,
  MicVocal,
  Moon,
  PanelRight,
  PictureInPicture2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  TvMinimalPlay,
  Volume,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { blok } from '../api'
import { formatTime } from '../lib/format'
import { openAlbum, useNav } from '../store/nav'
import { livePosition, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { ArtistLinks, Artwork, HeartButton } from './common'
import { Slider } from './Slider'

export function useLivePosition(intervalMs = 250): number {
  const state = usePlayer((s) => s.state)
  const stamp = usePlayer((s) => s.stamp)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!state?.playing) return
    const id = setInterval(() => tick((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [state?.playing, intervalMs])
  return livePosition(state, stamp)
}

function SleepButton() {
  const sleep = usePlayer((x) => x.sleep)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!sleep.endsAt) return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [sleep.endsAt])
  const active = !!sleep.endsAt || sleep.endOfTrack
  const left = sleep.endsAt ? Math.max(1, Math.ceil((sleep.endsAt - Date.now()) / 60_000)) : 0
  const title = sleep.endOfTrack ? 'Sleep timer: end of track' : sleep.endsAt ? `Sleep timer: ${left} min left` : 'Sleep timer'
  const set = (m: number | 'track' | null) => () => blok.app.setSleep(m)
  const open = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    useUi.getState().openMenu(r.right, r.top - 8, [
      ...[5, 15, 30, 45, 60].map((m) => ({ label: `${m} minutes`, onClick: set(m) })),
      { label: 'End of track', onClick: set('track') },
      ...(active ? [{ label: '', divider: true }, { label: 'Turn off timer', onClick: set(null) }] : [])
    ], { above: true, right: true })
  }
  return (
    <button className={`icon-btn ${active ? 'active dot' : ''}`} onClick={open} title={title}>
      <Moon size={17} />
    </button>
  )
}

export function PlayerBar() {
  const s = usePlayer((x) => x.state)
  const position = useLivePosition()
  const rightPanel = useUi((x) => x.rightPanel)
  const toggleRightPanel = useUi((x) => x.toggleRightPanel)
  const onLyrics = useNav((x) => x.stack[x.index].name === 'lyrics')
  const [scrub, setScrub] = useState<number | null>(null)
  const [vol, setVol] = useState<number | null>(null)
  const volTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const has = !!s?.videoId
  const duration = s?.duration ?? 0
  const volume = vol ?? (s?.muted ? 0 : (s?.volume ?? 100))
  const VolIcon = volume === 0 ? VolumeX : volume < 34 ? Volume : volume < 67 ? Volume1 : Volume2

  const setVolume = (v: number) => {
    setVol(v)
    clearTimeout(volTimer.current)
    volTimer.current = setTimeout(() => blok.player.setVolume(v), 40)
  }

  const toggleLyrics = () => {
    const nav = useNav.getState()
    if (onLyrics) nav.back()
    else nav.go({ name: 'lyrics' })
  }

  return (
    <footer className="playerbar">
      <div className="pb-left">
        {has && (
          <>
            <button className="pb-art" onClick={() => toggleRightPanel('nowplaying')} title="Now playing view">
              <Artwork src={s!.thumb} size={56} />
            </button>
            <div className="pb-meta">
              <div className="pb-title" title={s!.title}>
                {s!.adPlaying ? (
                  <span className="muted">Advertisement</span>
                ) : s!.album?.id ? (
                  <a className="link" onClick={() => openAlbum(s!.album!.id)}>
                    {s!.title}
                  </a>
                ) : (
                  s!.title
                )}
              </div>
              <div className="pb-artists">
                <ArtistLinks artists={s!.artists} />
              </div>
            </div>
            <HeartButton liked={s!.like === 'LIKE'} onToggle={() => blok.player.toggleLike()} />
          </>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-controls">
          <button className={`icon-btn ${s?.shuffle ? 'active dot' : ''}`} onClick={() => blok.player.toggleShuffle()} title="Shuffle" disabled={!has}>
            <Shuffle size={18} />
          </button>
          <button className="icon-btn" onClick={() => blok.player.previous()} title="Previous" disabled={!has}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="pb-play" onClick={() => blok.player.toggle()} title={s?.playing ? 'Pause' : 'Play'} disabled={!has}>
            {s?.playing ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />}
          </button>
          <button className="icon-btn" onClick={() => blok.player.next()} title="Next" disabled={!has}>
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            className={`icon-btn ${s && s.repeat !== 'NONE' ? 'active dot' : ''}`}
            onClick={() => blok.player.cycleRepeat()}
            title={s?.repeat === 'ONE' ? 'Repeat one' : s?.repeat === 'ALL' ? 'Repeat all' : 'Repeat'}
            disabled={!has}
          >
            {s?.repeat === 'ONE' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <div className="pb-progress">
          <span className="pb-time">{formatTime(scrub ?? position)}</span>
          <Slider
            label="Seek"
            value={position}
            max={duration}
            onChange={setScrub}
            onCommit={(v) => {
              setScrub(null)
              blok.player.seek(v)
            }}
          />
          <span className="pb-time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="pb-right">
        <button className={`icon-btn ${rightPanel === 'nowplaying' ? 'active dot' : ''}`} onClick={() => toggleRightPanel('nowplaying')} title="Now playing view">
          <PanelRight size={18} />
        </button>
        <button className={`icon-btn ${onLyrics ? 'active dot' : ''}`} onClick={toggleLyrics} title="Lyrics" disabled={!has}>
          <MicVocal size={18} />
        </button>
        <button className={`icon-btn ${rightPanel === 'queue' ? 'active dot' : ''}`} onClick={() => toggleRightPanel('queue')} title="Queue">
          <ListMusic size={18} />
        </button>
        {s?.isVideo && (
          <button className="icon-btn" onClick={() => blok.app.showEngine()} title="Show video">
            <TvMinimalPlay size={18} />
          </button>
        )}
        <SleepButton />
        <button className="icon-btn" onClick={() => blok.app.toggleMini()} title="Mini player">
          <PictureInPicture2 size={18} />
        </button>
        <div className="pb-volume">
          <button className="icon-btn" onClick={() => blok.player.toggleMute()} title={volume === 0 ? 'Unmute' : 'Mute'}>
            <VolIcon size={18} />
          </button>
          <Slider
            label="Volume"
            value={volume}
            max={100}
            onChange={setVolume}
            onCommit={(v) => {
              setVolume(v)
              setTimeout(() => setVol(null), 600)
            }}
          />
        </div>
      </div>
    </footer>
  )
}
