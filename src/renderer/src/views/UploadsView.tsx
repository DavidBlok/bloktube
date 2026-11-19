import { useQuery } from '@tanstack/react-query'
import { CloudUpload, ExternalLink } from 'lucide-react'
import type { Track } from '@shared/types'
import { blok, errorMessage } from '../api'
import { ShelfView } from '../components/Cards'
import { ErrorState, PlayCircle } from '../components/common'
import { Pending } from '../components/Offline'
import { TrackList } from '../components/TrackList'
import { isOnline } from '../lib/offline'
import { queries } from '../lib/query'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'

const COLOR = '#5a3d1f'
const CONTEXT = { id: 'uploads', title: 'Your uploads' }
const UPLOAD_URL = 'https://music.youtube.com/library/uploaded_songs'

export function UploadsView() {
  const q = useQuery(queries.uploads())
  const isContext = usePlayer((s) => s.context?.id === CONTEXT.id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const tracks = q.data?.tracks ?? []
  const albums = q.data?.albums ?? []

  const playFrom = (t: Track) => {
    const at = tracks.indexOf(t)
    if (!isOnline()) {
      usePlayer.getState().play({ videoId: t.videoId }, CONTEXT)
      return
    }
    usePlayer.setState({ context: CONTEXT })
    blok.player.playList(tracks.slice(Math.max(0, at)).map((x) => x.videoId)).catch((e) => toast(errorMessage(e)))
  }

  const playAll = () => {
    if (isContext) blok.player.toggle()
    else if (tracks[0]) playFrom(tracks[0])
  }

  return (
    <div className="view collection">
      <div className="hero" style={{ background: `linear-gradient(180deg, ${COLOR} 0%, ${COLOR}99 100%)` }}>
        <div className="hero-art history-art uploads-art">
          <CloudUpload size={80} strokeWidth={2} />
        </div>
        <div className="hero-info">
          <div className="hero-type">Library</div>
          <h1 className="hero-title t-lg">Your uploads</h1>
          {tracks.length > 0 && (
            <div className="hero-meta">
              <span className="dot-sep">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="action-bar" style={{ background: `linear-gradient(180deg, ${COLOR}66 0%, transparent 240px)` }}>
        {tracks.length > 0 && <PlayCircle size={56} playing={isContext && playing} onClick={playAll} />}
        <button className="pill outline small" onClick={() => blok.app.openExternal(UPLOAD_URL)}>
          <ExternalLink size={14} /> Upload music
        </button>
      </div>

      <div className="view-pad">
        {q.isPending ? (
          <Pending paused={q.fetchStatus === 'paused'} what="your uploads" />
        ) : q.isError && !q.data ? (
          <ErrorState message={errorMessage(q.error)} />
        ) : !tracks.length && !albums.length ? (
          <div className="empty-state">
            <h2>No uploads yet</h2>
            <p>Upload your own music on YouTube Music in your browser. It shows up here and plays like any other song.</p>
          </div>
        ) : (
          <>
            {tracks.length > 0 && <TrackList tracks={tracks} variant="playlist" context={CONTEXT} onPlay={playFrom} />}
            {albums.length > 0 && <ShelfView shelf={{ title: 'Albums', layout: 'grid', cards: albums, tracks: [] }} />}
          </>
        )}
      </div>
    </div>
  )
}
