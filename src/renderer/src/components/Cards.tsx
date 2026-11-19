import { useState, type MouseEvent } from 'react'
import { Play } from 'lucide-react'
import type { Card, Shelf, Track } from '@shared/types'
import { blok } from '../api'
import { cardMenu, trackMenu } from '../lib/actions'
import { artistNames } from '../lib/format'
import { openCard, openMore } from '../store/nav'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { ArtistLinks, Artwork, Equalizer, PlayCircle } from './common'

const kindLabel: Record<string, string> = {
  album: 'Album',
  playlist: 'Playlist',
  mix: 'Mix',
  artist: 'Artist',
  song: 'Song',
  video: 'Video',
  podcast: 'Podcast',
  episode: 'Episode'
}

export function useIsPlayingContext(id: string) {
  return usePlayer((s) => s.context?.id === id && !!s.state?.playing)
}

export function CardTile({ card }: { card: Card }) {
  const play = usePlayer((s) => s.play)
  const isCurrent = usePlayer((s) => s.context?.id === card.id || (!!s.state?.videoId && s.state.videoId === card.id))
  const playing = usePlayer((s) => !!s.state?.playing)
  const openMenu = useUi((s) => s.openMenu)

  const onPlay = () => {
    if (isCurrent) blok.player.toggle()
    else play(card.play ?? (card.kind === 'song' || card.kind === 'video' ? { videoId: card.id } : undefined), { id: card.id, title: card.title })
  }
  const onClick = () => {
    if (!openCard(card)) onPlay()
  }
  const onContext = (e: MouseEvent) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY, cardMenu(card))
  }

  if (card.kind === 'category') {
    return (
      <div className="category-tile" style={{ background: card.color ?? '#535353' }} onClick={onClick}>
        <span>{card.title}</span>
      </div>
    )
  }

  const sub = card.kind === 'artist' ? card.subtitle || 'Artist' : card.subtitle
  return (
    <div className={`card ${card.kind}`} onClick={onClick} onContextMenu={onContext}>
      <div className={`card-art ${card.wide ? 'wide' : ''}`}>
        <Artwork src={card.thumb} round={card.kind === 'artist'} />
        {(card.play || card.kind === 'song' || card.kind === 'video') && (
          <PlayCircle className={`card-play ${isCurrent && playing ? 'visible' : ''}`} size={48} playing={isCurrent && playing} onClick={onPlay} />
        )}
      </div>
      <div className={`card-title ${isCurrent ? 'current' : ''}`} title={card.title}>
        {card.title}
      </div>
      <div className="card-sub">{sub || kindLabel[card.kind]}</div>
    </div>
  )
}

export function CompactTrack({ track, context }: { track: Track; context?: { id: string; title: string } | null }) {
  const play = usePlayer((s) => s.play)
  const current = usePlayer((s) => s.state?.videoId === track.videoId)
  const playing = usePlayer((s) => !!s.state?.playing)
  const openMenu = useUi((s) => s.openMenu)
  const start = () => {
    if (current) blok.player.toggle()
    else play({ videoId: track.videoId, playlistId: track.playlistId }, context ?? null)
  }
  return (
    <div
      className={`compact-track ${current ? 'current' : ''}`}
      onDoubleClick={start}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, trackMenu(track))
      }}
    >
      <div className="compact-art" onClick={start}>
        <Artwork src={track.thumb} size={48} />
        <div className="compact-overlay">{current && playing ? <Equalizer /> : <Play size={18} fill="currentColor" strokeWidth={0} />}</div>
      </div>
      <div className="compact-text">
        <div className="compact-title" title={track.title}>
          {track.title}
        </div>
        <div className="compact-sub" title={artistNames(track.artists)}>
          {track.explicit && <span className="explicit">E</span>}
          <ArtistLinks artists={track.artists} />
        </div>
      </div>
    </div>
  )
}

export function ShelfView({ shelf, context }: { shelf: Shelf; context?: { id: string; title: string } | null }) {
  const [all, setAll] = useState(false)
  const hasMore = !!shelf.more
  const title = shelf.title || (shelf.layout === 'tracks' ? 'Songs' : '')
  const showAll = () => (hasMore ? openMore(shelf) : setAll((v) => !v))

  return (
    <section className="shelf">
      {(title || shelf.strapline) && (
        <header className="shelf-header">
          <div>
            {shelf.strapline && <div className="shelf-strapline">{shelf.strapline}</div>}
            <h2 className={hasMore ? 'clickable' : ''} onClick={hasMore ? showAll : undefined}>
              {title}
            </h2>
          </div>
          {(hasMore || shelf.cards.length > 5 || shelf.tracks.length > 8) && (
            <button className="show-all" onClick={showAll}>
              {all ? 'Show less' : 'Show all'}
            </button>
          )}
        </header>
      )}
      {shelf.tracks.length > 0 && (
        <div className={`compact-grid ${all ? 'all' : ''}`}>
          {shelf.tracks.map((t, i) => (
            <CompactTrack key={`${t.videoId}-${i}`} track={t} context={context} />
          ))}
        </div>
      )}
      {shelf.cards.length > 0 && (
        <div className={`card-row ${all || shelf.layout === 'grid' ? 'all' : ''} ${shelf.cards[0]?.kind === 'category' ? 'categories' : ''}`}>
          {shelf.cards.map((c, i) => (
            <CardTile key={`${c.id}-${c.params ?? ''}-${i}`} card={c} />
          ))}
        </div>
      )}
    </section>
  )
}
