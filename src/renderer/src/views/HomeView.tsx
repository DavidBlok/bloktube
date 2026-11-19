import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { Card } from '@shared/types'
import { blok, errorMessage } from '../api'
import { ShelfView } from '../components/Cards'
import { Artwork, ErrorState, PlayCircle, Spinner, useArtColor } from '../components/common'
import { Pending } from '../components/Offline'
import { cardMenu } from '../lib/actions'
import { greeting } from '../lib/format'
import { queries } from '../lib/query'
import { useSentinel } from '../lib/useSentinel'
import { openCard } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'

export function HomeView() {
  const home = useInfiniteQuery(queries.home())
  const [hover, setHover] = useState<string | undefined>()
  const shelves = useMemo(() => home.data?.shelves ?? [], [home.data])

  const quick = useMemo(() => {
    const seen = new Set<string>()
    const out: Card[] = []
    for (const s of shelves) {
      for (const c of s.cards) {
        if (!['album', 'playlist', 'mix', 'artist'].includes(c.kind) || seen.has(c.id)) continue
        seen.add(c.id)
        out.push(c)
        if (out.length >= 8) return out
      }
    }
    return out
  }, [shelves])

  const color = useArtColor(hover ?? quick[0]?.thumb, '#3b3b3b')

  const loadMore = async () => {
    const r = await home.fetchNextPage()
    if (r.isError) toast(errorMessage(r.error))
  }
  const sentinel = useSentinel(loadMore, home.hasNextPage && !home.isFetching && !home.isFetchNextPageError)

  if (home.isError && !home.data) {
    return <ErrorState message={errorMessage(home.error)} action={<button className="pill white" onClick={() => home.refetch()}>Try again</button>} />
  }

  return (
    <div className="view home">
      <div className="home-gradient" style={{ background: `linear-gradient(180deg, ${color}cc 0%, transparent 100%)` }} />
      <div className="view-pad">
        <h1 className="greeting">{greeting()}</h1>
        {quick.length > 0 && (
          <div className="quick-grid">
            {quick.map((c) => (
              <QuickTile key={c.id} card={c} onHover={setHover} />
            ))}
          </div>
        )}
        {home.isPending ? <Pending paused={home.fetchStatus === 'paused'} what="Home" /> : shelves.map((s, i) => <ShelfView key={`${s.title}-${i}`} shelf={s} />)}
        <div ref={sentinel} />
        {home.isFetchingNextPage && <Spinner />}
      </div>
    </div>
  )
}

function QuickTile({ card, onHover }: { card: Card; onHover: (thumb: string | undefined) => void }) {
  const play = usePlayer((s) => s.play)
  const isCurrent = usePlayer((s) => s.context?.id === card.id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const openMenu = useUi((s) => s.openMenu)
  return (
    <div
      className="quick-tile"
      onClick={() => openCard(card)}
      onMouseEnter={() => onHover(card.thumb)}
      onMouseLeave={() => onHover(undefined)}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, cardMenu(card))
      }}
    >
      <Artwork src={card.thumb} size={64} round={card.kind === 'artist'} />
      <span className={`quick-title ${isCurrent ? 'current' : ''}`}>{card.title}</span>
      {card.play && (
        <PlayCircle
          size={36}
          className={`quick-play ${isCurrent && playing ? 'visible' : ''}`}
          playing={isCurrent && playing}
          onClick={() => (isCurrent ? blok.player.toggle() : play(card.play, { id: card.id, title: card.title }))}
        />
      )}
    </div>
  )
}
