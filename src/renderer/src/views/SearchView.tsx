import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Card, SearchFilter } from '@shared/types'
import { blok, errorMessage } from '../api'
import { CardTile, ShelfView } from '../components/Cards'
import { Artwork, ErrorState, PlayCircle, Spinner } from '../components/common'
import { Pending } from '../components/Offline'
import { TrackList } from '../components/TrackList'
import { cardMenu } from '../lib/actions'
import { queries } from '../lib/query'
import { useSentinel } from '../lib/useSentinel'
import { openCard, useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'

const FILTERS: { id: SearchFilter | undefined; label: string }[] = [
  { id: undefined, label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'videos', label: 'Videos' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'podcasts', label: 'Podcasts' }
]

export function SearchView({ query, filter }: { query: string; filter?: SearchFilter }) {
  const q = query.trim()
  if (!q) return <BrowseAll />
  return (
    <div className="view">
      <div className="view-pad">
        <div className="chips search-chips">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              className={`chip ${filter === f.id ? 'active' : ''}`}
              onClick={() => useNav.getState().replace({ name: 'search', query, filter: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filter ? <FilteredResults key={`${filter}:${q}`} query={q} filter={filter} /> : <AllResults key={q} query={q} />}
      </div>
    </div>
  )
}

function BrowseAll() {
  const moods = useQuery(queries.moods())
  return (
    <div className="view">
      <div className="view-pad">
        <h2 className="section-title">Browse all</h2>
        {moods.isPending && <Pending paused={moods.fetchStatus === 'paused'} what="categories" />}
        {moods.isError && <ErrorState message={errorMessage(moods.error)} />}
        <div className="category-grid">
          {(moods.data ?? []).map((c, i) => (
            <CardTile key={`${c.params}-${i}`} card={c} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AllResults({ query }: { query: string }) {
  const res = useQuery(queries.searchAll(query))
  if (res.isPending) return <Pending paused={res.fetchStatus === 'paused'} what="search results" />
  if (res.isError && !res.data) return <ErrorState message={errorMessage(res.error)} />
  const r = res.data
  if (!r.top && !r.shelves.length) return <NoResults query={query} />

  const songs = r.topTracks
  const shelves = r.shelves.filter((s) => !(s.title === 'Songs' && songs.length))
  return (
    <>
      <div className="search-top">
        {r.top && (
          <section className="top-result">
            <h2 className="section-title">Top result</h2>
            <TopResult card={r.top} />
          </section>
        )}
        {songs.length > 0 && (
          <section className="top-songs">
            <h2 className="section-title">Songs</h2>
            <TrackList tracks={songs.slice(0, 4)} variant="popular" showHeader={false} />
          </section>
        )}
      </div>
      {shelves.map((s, i) => (
        <ShelfView key={`${s.title}-${i}`} shelf={s} />
      ))}
    </>
  )
}

function TopResult({ card }: { card: Card }) {
  const play = usePlayer((s) => s.play)
  const isCurrent = usePlayer((s) => s.context?.id === card.id || s.state?.videoId === card.id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const openMenu = useUi((s) => s.openMenu)
  const type = card.subtitle.split(' • ')[0]
  const rest = card.subtitle.split(' • ').slice(1).join(' • ')
  return (
    <div
      className="top-card"
      onClick={() => openCard(card) || play(card.play, null)}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, cardMenu(card))
      }}
    >
      <Artwork src={card.thumb} size={96} round={card.kind === 'artist'} />
      <div className="top-card-title">{card.title}</div>
      <div className="top-card-sub">
        {rest && <span>{rest}</span>}
        <span className="type-pill">{type}</span>
      </div>
      {card.play && (
        <PlayCircle
          className={`card-play ${isCurrent && playing ? 'visible' : ''}`}
          size={48}
          playing={isCurrent && playing}
          onClick={() => (isCurrent ? blok.player.toggle() : play(card.play, { id: card.id, title: card.title }))}
        />
      )}
    </div>
  )
}

function FilteredResults({ query, filter }: { query: string; filter: SearchFilter }) {
  const res = useInfiniteQuery(queries.search(query, filter))

  const loadMore = async () => {
    const r = await res.fetchNextPage()
    if (r.isError) toast(errorMessage(r.error))
  }
  const sentinel = useSentinel(loadMore, res.hasNextPage && !res.isFetching && !res.isFetchNextPageError)

  if (res.isPending) return <Pending paused={res.fetchStatus === 'paused'} what="search results" />
  if (res.isError && !res.data) return <ErrorState message={errorMessage(res.error)} />
  const r = res.data
  if (!r.tracks.length && !r.cards.length) return <NoResults query={query} />
  return (
    <>
      {r.tracks.length > 0 && <TrackList tracks={r.tracks} variant="search" />}
      {r.cards.length > 0 && (
        <div className="card-row all">
          {r.cards.map((c, i) => (
            <CardTile key={`${c.id}-${i}`} card={c} />
          ))}
        </div>
      )}
      <div ref={sentinel} />
      {res.isFetchingNextPage && <Spinner />}
    </>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="empty-state">
      <h2>No results found for “{query}”</h2>
      <p>Please make sure your words are spelled correctly, or use fewer or different keywords.</p>
    </div>
  )
}
