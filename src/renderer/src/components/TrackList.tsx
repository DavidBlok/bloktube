import { memo, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { Clock3, Ellipsis, Play } from 'lucide-react'
import type { DownloadedTrack, Track } from '@shared/types'
import { blok } from '../api'
import { trackMenu, tracksMenu } from '../lib/actions'
import { endTrackDrag, getTrackDrag, startTrackDrag } from '../lib/drag'
import { movePlaylistItems, rateTrack } from '../lib/mutations'
import { openAlbum } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, useUi, type MenuItem } from '../store/ui'
import { ArtistLinks, Artwork, Equalizer, HeartButton } from './common'
import { DownloadGlyph } from './Download'

export type TrackListVariant = 'playlist' | 'album' | 'search' | 'popular' | 'episodes'

export interface TrackContext {
  id: string
  title: string
  playlistId?: string
  editable?: boolean
}

interface Props {
  tracks: Track[]
  variant: TrackListVariant
  context?: TrackContext | null
  showHeader?: boolean
  onPlay?: (track: Track) => void
  menuExtras?: (track: Track) => MenuItem[]
  partial?: boolean
}

function rowKeys(tracks: Track[]): string[] {
  const seen = new Map<string, number>()
  return tracks.map((t) => {
    if (t.setVideoId) return `${t.videoId}-${t.setVideoId}`
    const n = seen.get(t.videoId) ?? 0
    seen.set(t.videoId, n + 1)
    return `${t.videoId}#${n}`
  })
}

export function TrackList({ tracks, variant, context, showHeader = true, onPlay, menuExtras, partial }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null)
  const currentId = usePlayer((s) => s.state?.videoId ?? null)
  const playing = usePlayer((s) => !!s.state?.playing)
  const currentLike = usePlayer((s) => s.state?.like)
  const play = usePlayer((s) => s.play)
  const openMenu = useUi((s) => s.openMenu)
  const downloaded = usePlayer((s) => s.downloads.tracks)
  const downloads = useMemo(() => new Map(downloaded.map((d) => [d.videoId, d])), [downloaded])
  const keys = useMemo(() => rowKeys(tracks), [tracks])
  const playlist = context?.editable ? context : undefined
  const reorderable = !!playlist && variant === 'playlist'

  useEffect(() => {
    if (!selected.size) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useUi.getState().menu) setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  const selectedTracks = () => tracks.filter((_, i) => selected.has(keys[i]))

  const start = (t: Track) => {
    if (t.videoId === currentId) {
      blok.player.toggle()
      return
    }
    if (onPlay) {
      onPlay(t)
      return
    }
    const playlistId = context?.playlistId ?? t.playlistId
    play({ videoId: t.videoId, playlistId }, context ? { id: context.id, title: context.title } : null)
  }

  const select = (i: number, e: MouseEvent) => {
    const key = keys[i]
    if (e.shiftKey && anchor) {
      const a = keys.indexOf(anchor)
      if (a >= 0) {
        const [from, to] = a < i ? [a, i] : [i, a]
        setSelected(new Set(keys.slice(from, to + 1)))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelected(next)
    } else setSelected(new Set([key]))
    setAnchor(key)
  }

  const dragStart = (i: number, e: DragEvent) => {
    const key = keys[i]
    let picked = [tracks[i]]
    if (selected.has(key) && selected.size > 1) picked = selectedTracks()
    else {
      setSelected(new Set([key]))
      setAnchor(key)
    }
    startTrackDrag(e, { tracks: picked, source: reorderable ? playlist!.id : undefined })
  }

  const dragOver = (i: number, e: DragEvent) => {
    if (!reorderable || getTrackDrag()?.source !== playlist!.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    if (drop?.key !== keys[i] || drop.after !== after) setDrop({ key: keys[i], after })
  }

  const dropOn = (i: number, e: DragEvent) => {
    const drag = getTrackDrag()
    setDrop(null)
    if (!reorderable || drag?.source !== playlist!.id) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    const moving = new Set(drag.tracks.map((t) => t.setVideoId))
    let j = after ? i + 1 : i
    while (j < tracks.length && moving.has(tracks[j].setVideoId)) j++
    if (j >= tracks.length && partial) {
      toast('Scroll down to load the rest of the playlist first')
      return
    }
    movePlaylistItems(playlist!, drag.tracks, tracks[j] ?? null)
  }

  return (
    <div className={`tracklist v-${variant}`} role="grid" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
      {showHeader && variant !== 'popular' && variant !== 'episodes' && (
        <div className="tl-row tl-head">
          <div className="tl-index">#</div>
          <div className="tl-title">Title</div>
          {variant !== 'album' && <div className="tl-album">Album</div>}
          {variant === 'album' && <div className="tl-plays">Plays</div>}
          <div className="tl-duration">
            <Clock3 size={16} />
          </div>
        </div>
      )}
      {tracks.map((track, i) => {
        const t = track.videoId === currentId && currentLike ? { ...track, likeStatus: currentLike } : track
        const key = keys[i]
        return (
          <Row
            key={key}
            track={t}
            index={i}
            variant={variant}
            selected={selected.has(key)}
            current={t.videoId === currentId}
            playing={playing}
            download={downloads.get(t.videoId)}
            dropEdge={drop?.key === key ? (drop.after ? 'after' : 'before') : undefined}
            onSelect={(e) => select(i, e)}
            onStart={() => start(t)}
            onMenu={(e) => {
              e.preventDefault()
              if (selected.has(key) && selected.size > 1) {
                openMenu(e.clientX, e.clientY, tracksMenu(selectedTracks(), { playlist }))
                return
              }
              setSelected(new Set([key]))
              setAnchor(key)
              openMenu(e.clientX, e.clientY, trackMenu(t, { playlist, extra: menuExtras?.(t) }))
            }}
            onRate={() => rateTrack(t, t.likeStatus === 'LIKE' ? 'INDIFFERENT' : 'LIKE')}
            onDragStart={(e) => dragStart(i, e)}
            onDragOver={(e) => dragOver(i, e)}
            onDrop={(e) => dropOn(i, e)}
          />
        )
      })}
    </div>
  )
}

interface RowProps {
  track: Track
  index: number
  variant: TrackListVariant
  selected: boolean
  current: boolean
  playing: boolean
  download?: DownloadedTrack
  dropEdge?: 'before' | 'after'
  onSelect: (e: MouseEvent) => void
  onStart: () => void
  onMenu: (e: MouseEvent) => void
  onRate: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

const Row = memo(function Row(props: RowProps) {
  const { track: t, index, variant, selected, current, playing, download, dropEdge, onSelect, onStart, onMenu, onRate } = props
  const unavailable = t.available === false
  if (variant === 'episodes') return <EpisodeRow {...props} />
  return (
    <div
      className={`tl-row ${selected ? 'selected' : ''} ${current ? 'current' : ''} ${unavailable ? 'unavailable' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
      onClick={onSelect}
      onDoubleClick={unavailable ? undefined : onStart}
      onContextMenu={onMenu}
      draggable={!unavailable}
      onDragStart={props.onDragStart}
      onDragEnd={endTrackDrag}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      role="row"
      aria-selected={selected}
    >
      <div className="tl-index">
        <span className="tl-num">{current && playing ? <Equalizer /> : variant === 'album' ? (t.index ?? index + 1) : index + 1}</span>
        <button
          className="tl-play"
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          aria-label="Play"
        >
          {current && playing ? <span className="pause-glyph" /> : <Play size={14} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className="tl-title">
        {variant !== 'album' && <Artwork src={t.thumb} size={40} />}
        <div className="tl-title-text">
          <div className="tl-name" title={t.title}>
            {t.title}
          </div>
          {variant !== 'popular' && (
            <div className="tl-artists">
              {download && <DownloadGlyph status={download.status} progress={download.progress} />}
              {t.explicit && <span className="explicit">E</span>}
              {t.isVideo && variant !== 'album' && <span className="badge">Video</span>}
              <ArtistLinks artists={t.artists} />
            </div>
          )}
        </div>
      </div>
      {variant !== 'album' && variant !== 'popular' && (
        <div className="tl-album">
          {t.album?.id ? (
            <a
              className="link"
              onClick={(e) => {
                e.stopPropagation()
                openAlbum(t.album!.id)
              }}
            >
              {t.album.name}
            </a>
          ) : (
            <span>{t.album?.name ?? ''}</span>
          )}
        </div>
      )}
      {(variant === 'album' || variant === 'popular') && <div className="tl-plays">{t.views?.replace(/\s*(plays|views)$/i, '') ?? ''}</div>}
      <div className="tl-duration">
        <HeartButton liked={t.likeStatus === 'LIKE'} onToggle={onRate} className="tl-heart" />
        <span>{t.duration ?? ''}</span>
        <button
          className="icon-btn tl-more"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
          aria-label="More options"
        >
          <Ellipsis size={16} />
        </button>
      </div>
    </div>
  )
})

function EpisodeRow({ track: t, selected, current, playing, dropEdge, onSelect, onStart, onMenu, ...drag }: RowProps) {
  const e = t.episode
  return (
    <div
      className={`tl-row ep-row ${selected ? 'selected' : ''} ${current ? 'current' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
      onClick={onSelect}
      onDoubleClick={onStart}
      onContextMenu={onMenu}
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={endTrackDrag}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      role="row"
      aria-selected={selected}
    >
      <Artwork src={t.thumb} size={96} className="ep-art" />
      <div className="ep-text">
        <div className="tl-name ep-title" title={t.title}>
          {t.title}
        </div>
        {e?.description && <div className="ep-desc">{e.description}</div>}
        <div className="ep-meta">
          <button
            className="pb-play ep-play"
            onClick={(ev) => {
              ev.stopPropagation()
              onStart()
            }}
            aria-label={current && playing ? 'Pause' : 'Play'}
          >
            {current && playing ? <span className="pause-glyph" /> : <Play size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
          </button>
          {[e?.date, t.duration].filter(Boolean).join(' • ')}
          {e?.progress !== undefined && (
            <span className="ep-progress">
              <span style={{ width: `${e.progress}%` }} />
            </span>
          )}
        </div>
      </div>
      <button
        className="icon-btn tl-more ep-more"
        onClick={(ev) => {
          ev.stopPropagation()
          onMenu(ev)
        }}
        aria-label="More options"
      >
        <Ellipsis size={16} />
      </button>
    </div>
  )
}
