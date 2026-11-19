import { useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import type { QueueItem, Track } from '@shared/types'
import { blok } from '../api'
import { trackMenu } from '../lib/actions'
import { endTrackDrag, getTrackDrag, startTrackDrag } from '../lib/drag'
import { hiRes } from '../lib/format'
import { queries } from '../lib/query'
import { openAlbum, openArtist } from '../store/nav'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { ArtistLinks, Artwork, Equalizer, HeartButton, PlaylistButton } from './common'

export function RightPanel() {
  const panel = useUi((s) => s.rightPanel)
  if (panel === 'none') return null
  return <aside className="rightpanel panel">{panel === 'queue' ? <QueuePanel /> : <NowPlayingPanel />}</aside>
}

function PanelHeader({ title }: { title: string }) {
  const setRightPanel = useUi((s) => s.setRightPanel)
  return (
    <header className="rp-header">
      <h3 title={title}>{title}</h3>
      <button className="icon-btn" onClick={() => setRightPanel('none')} title="Close">
        <X size={18} />
      </button>
    </header>
  )
}

function NowPlayingPanel() {
  const s = usePlayer((x) => x.state)
  const context = usePlayer((x) => x.context)
  const queue = usePlayer((x) => x.queue)
  const toggleRightPanel = useUi((x) => x.toggleRightPanel)
  const artistId = s?.artists.find((a) => a.id)?.id ?? null
  const artist = useQuery({ ...queries.artist(artistId ?? ''), enabled: !!artistId })
  const next = queue.index >= 0 ? queue.items[queue.index + 1] : undefined

  if (!s?.videoId) {
    return (
      <>
        <PanelHeader title="Now playing" />
        <div className="rp-empty">Play something to see it here.</div>
      </>
    )
  }

  return (
    <>
      <PanelHeader title={context?.title ?? 'Now playing'} />
      <div className="rp-scroll">
        <div className="np-art">
          <Artwork src={hiRes(s.thumb, 720)} />
        </div>
        <div className="np-meta">
          <div className="np-text">
            <div className="np-title" title={s.title}>
              {s.album?.id ? (
                <a className="link" onClick={() => openAlbum(s.album!.id)}>
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </div>
            <div className="np-artists">
              <ArtistLinks artists={s.artists} />
            </div>
          </div>
          <HeartButton liked={s.like === 'LIKE'} onToggle={() => blok.player.toggleLike()} size={20} />
          {!s.adPlaying && <PlaylistButton videoId={s.videoId} size={20} />}
        </div>

        {artist.data && (
          <div className="np-card np-artist" onClick={() => openArtist(artist.data!.id)}>
            <div className="np-artist-hero" style={{ backgroundImage: artist.data.thumb ? `url("${hiRes(artist.data.thumb, 720)}")` : undefined }}>
              <span>About the artist</span>
            </div>
            <div className="np-artist-body">
              <div className="np-artist-name">{artist.data.name}</div>
              {artist.data.subscribers && <div className="muted">{artist.data.subscribers}</div>}
              {artist.data.description && <p className="np-artist-desc">{artist.data.description}</p>}
            </div>
          </div>
        )}

        {next && (
          <div className="np-card">
            <div className="np-card-head">
              <span>Next in queue</span>
              <a className="link small" onClick={() => toggleRightPanel('queue')}>
                Open queue
              </a>
            </div>
            <QueueRow item={next} index={queue.index + 1} />
          </div>
        )}
      </div>
    </>
  )
}

function QueuePanel() {
  const queue = usePlayer((x) => x.queue)
  const context = usePlayer((x) => x.context)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | 'end' | null>(null)
  const current = queue.index >= 0 ? queue.items[queue.index] : undefined
  const upcoming = queue.items.map((item, index) => ({ item, index })).filter(({ index }) => index > queue.index)
  const next = upcoming.length ? queue.index + 1 : 'end'

  const reset = () => {
    setDragFrom(null)
    setOver(null)
  }
  const accept = (at: number | 'end', e: DragEvent) => {
    if (dragFrom !== null || !getTrackDrag()) return false
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (over !== at) setOver(at)
    return true
  }
  const insert = (at: number | 'end', e: DragEvent) => {
    const drag = getTrackDrag()
    if (dragFrom !== null || !drag) return
    e.preventDefault()
    e.stopPropagation()
    reset()
    const ids = [...new Set(drag.tracks.map((t) => t.videoId))]
    usePlayer.getState().addToQueue(ids, at === queue.index + 1, at === 'end' ? undefined : at)
  }

  return (
    <>
      <PanelHeader title="Queue" />
      <div
        className={`rp-scroll ${over === 'end' ? 'drop-target' : ''}`}
        onDragOver={(e) => accept('end', e)}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
        onDrop={(e) => insert('end', e)}
      >
        {!current && !upcoming.length ? (
          <div className="rp-empty">Your queue is empty.</div>
        ) : (
          <>
            {current && (
              <section className="q-section" onDragOver={(e) => accept(next, e)} onDrop={(e) => insert(next, e)}>
                <h4>Now playing</h4>
                <QueueRow item={current} index={queue.index} current />
              </section>
            )}
            {upcoming.length > 0 && (
              <section className="q-section">
                <h4>
                  Next from: <span className="q-context">{context?.title ?? 'your queue'}</span>
                </h4>
                {upcoming.map(({ item, index }) => (
                  <div
                    key={`${item.videoId}-${index}`}
                    className={`q-drag ${over === index ? 'over' : ''}`}
                    onDragStart={() => setDragFrom(index)}
                    onDragOver={(e) => {
                      if (dragFrom === null) return accept(index, e)
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'move'
                      if (over !== index) setOver(index)
                    }}
                    onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver((o) => (o === index ? null : o))}
                    onDrop={(e) => {
                      if (dragFrom === null) return insert(index, e)
                      e.preventDefault()
                      e.stopPropagation()
                      if (dragFrom !== index) blok.queue.move(dragFrom, index)
                      reset()
                    }}
                    onDragEnd={reset}
                  >
                    <QueueRow item={item} index={index} removable />
                  </div>
                ))}
              </section>
            )}
            {queue.autoplay.length > 0 && (
              <section className="q-section">
                <h4>Autoplay</h4>
                <p className="muted small">Similar music plays when your queue ends.</p>
                {queue.autoplay.slice(0, 20).map((item, i) => (
                  <QueueRow key={`auto-${item.videoId}-${i}`} item={item} index={-1} />
                ))}
              </section>
            )}
            {upcoming.length > 0 && (
              <button className="pill outline small q-clear" onClick={() => blok.queue.clear()}>
                Clear queue
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}

function QueueRow({ item, index, current, removable }: { item: QueueItem; index: number; current?: boolean; removable?: boolean }) {
  const playing = usePlayer((x) => !!x.state?.playing)
  const openMenu = useUi((s) => s.openMenu)
  const track = (): Track => {
    const now = usePlayer.getState().state
    return {
      videoId: item.videoId,
      title: item.title,
      artists: item.artists,
      album: item.album ?? null,
      thumb: item.thumb,
      duration: item.duration,
      likeStatus: now?.videoId === item.videoId ? now.like : undefined
    }
  }
  const play = () => {
    if (current) blok.player.toggle()
    else if (index >= 0) blok.queue.playIndex(index)
    else usePlayer.getState().play({ videoId: item.videoId }, null)
  }
  return (
    <div
      className={`q-row ${current ? 'current' : ''}`}
      draggable
      onDragStart={(e) => startTrackDrag(e, { tracks: [track()] })}
      onDragEnd={endTrackDrag}
      onDoubleClick={play}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, trackMenu(track(), { onRemove: removable ? () => blok.queue.remove(index) : undefined }))
      }}
    >
      <div className="q-art" onClick={play}>
        <Artwork src={item.thumb} size={48} />
        {current && playing && (
          <div className="q-eq">
            <Equalizer />
          </div>
        )}
      </div>
      <div className="q-text">
        <div className="q-title" title={item.title}>
          {item.title}
        </div>
        <div className="q-sub">
          <ArtistLinks artists={item.artists} />
        </div>
      </div>
      <span className="q-dur">{item.duration}</span>
    </div>
  )
}
