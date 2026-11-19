import { useEffect, useMemo } from 'react'
import { ArrowDown } from 'lucide-react'
import { blok } from '../api'
import { PlayCircle } from '../components/common'
import { TrackList } from '../components/TrackList'
import { formatTotal } from '../lib/format'
import { downloadedToTrack } from '../lib/offline'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

const COLOR = '#1d6b3a'
const CONTEXT = { id: 'downloads', title: 'Downloads' }

export function DownloadsView() {
  const downloads = usePlayer((s) => s.downloads)
  const playLocal = usePlayer((s) => s.playLocal)
  const isContext = usePlayer((s) => s.context?.id === 'downloads')
  const playing = usePlayer((s) => !!s.state?.playing)
  const setHeader = useUi((s) => s.setHeader)
  const tracks = useMemo(() => downloads.tracks.map(downloadedToTrack), [downloads.tracks])
  const ready = useMemo(() => downloads.tracks.filter((t) => t.status === 'done').map((t) => t.videoId), [downloads.tracks])
  const pending = downloads.tracks.filter((t) => t.status !== 'done').length
  const totalSec = downloads.tracks.reduce((a, t) => a + (t.durationSec ?? 0), 0)

  const playFrom = (videoId: string) => {
    const i = ready.indexOf(videoId)
    if (i >= 0) playLocal(ready.slice(i), CONTEXT)
  }

  const onPlay = () => {
    if (isContext) blok.player.toggle()
    else if (ready[0]) playFrom(ready[0])
  }

  useEffect(() => {
    setHeader({ title: 'Downloads', color: COLOR, play: onPlay, playing: isContext && playing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContext, playing, tracks.length])

  return (
    <div className="view collection">
      <div className="hero" style={{ background: `linear-gradient(180deg, ${COLOR} 0%, ${COLOR}99 100%)` }}>
        <div className="hero-art downloads-art">
          <ArrowDown size={80} strokeWidth={2.5} />
        </div>
        <div className="hero-info">
          <div className="hero-type">Playlist</div>
          <h1 className="hero-title t-xl">Downloads</h1>
          <div className="hero-meta">
            <span className="dot-sep">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </span>
            {totalSec > 0 && <span className="dot-sep">{formatTotal(totalSec)}</span>}
            {pending > 0 && <span className="dot-sep">{pending} downloading</span>}
          </div>
        </div>
      </div>

      <div className="action-bar" style={{ background: `linear-gradient(180deg, ${COLOR}66 0%, transparent 240px)` }}>
        {ready.length > 0 && <PlayCircle size={56} playing={isContext && playing} onClick={onPlay} />}
      </div>

      <div className="view-pad">
        {tracks.length ? (
          <TrackList tracks={tracks} variant="playlist" context={CONTEXT} onPlay={(t) => playFrom(t.videoId)} />
        ) : (
          <div className="empty-state">
            <h2>Nothing downloaded yet</h2>
            <p>Use the download button on an album or playlist, or right-click a song and choose Download.</p>
          </div>
        )}
      </div>
    </div>
  )
}
