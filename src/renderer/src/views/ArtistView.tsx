import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio, Shuffle } from 'lucide-react'
import { blok, errorMessage } from '../api'
import { ShelfView } from '../components/Cards'
import { ErrorState, PlayCircle, useArtColor } from '../components/common'
import { Pending } from '../components/Offline'
import { TrackList } from '../components/TrackList'
import { hiRes, titleSize } from '../lib/format'
import { useFollowArtist } from '../lib/mutations'
import { queries } from '../lib/query'
import { useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { useUi } from '../store/ui'

export function ArtistView({ id }: { id: string }) {
  const q = useQuery(queries.artist(id))
  const a = q.data
  const follow = useFollowArtist(id)
  const color = useArtColor(a?.thumb, '#404040')
  const play = usePlayer((s) => s.play)
  const signedIn = usePlayer((s) => s.auth.status === 'signed-in')
  const isContext = usePlayer((s) => s.context?.id === id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const setHeader = useUi((s) => s.setHeader)
  const [showAll, setShowAll] = useState(false)

  const onPlay = () => {
    if (!a) return
    if (isContext) blok.player.toggle()
    else play(a.shuffle ?? a.radio, { id, title: a.name })
  }

  useEffect(() => {
    if (a) setHeader({ title: a.name, color, play: onPlay, playing: isContext && playing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, color, isContext, playing])

  if (q.isPending) return <Pending paused={q.fetchStatus === 'paused'} what="this artist" />
  if (q.isError && !a) return <ErrorState message={errorMessage(q.error)} />
  if (!a) return null

  const toggleFollow = () => {
    if (a.channelId) follow.mutate({ channelId: a.channelId, follow: !a.subscribed, name: a.name })
  }

  return (
    <div className="view artist">
      <div className="artist-hero" style={{ backgroundColor: color }}>
        {a.thumb && <div className="artist-hero-img" style={{ backgroundImage: `url("${hiRes(a.thumb, 1440)}")` }} />}
        <div className="artist-hero-shade" />
        <div className="artist-hero-info">
          <h1 className={`hero-title t-${titleSize(a.name)}`}>{a.name}</h1>
          {a.subscribers && <div className="artist-listeners">{a.subscribers}</div>}
        </div>
      </div>

      <div className="action-bar" style={{ background: `linear-gradient(180deg, ${color}88 0%, transparent 240px)` }}>
        <PlayCircle size={56} playing={isContext && playing} onClick={onPlay} />
        {a.shuffle && (
          <button className="icon-btn big" onClick={() => play(a.shuffle, { id, title: a.name })} title="Shuffle">
            <Shuffle size={28} />
          </button>
        )}
        {signedIn && a.channelId && (
          <button className={`pill outline ${a.subscribed ? 'following' : ''}`} onClick={toggleFollow} disabled={follow.isPending}>
            {a.subscribed ? 'Following' : 'Follow'}
          </button>
        )}
        {a.radio && (
          <button className="icon-btn big" onClick={() => play(a.radio, { id: `radio:${id}`, title: `${a.name} Radio` })} title="Start radio">
            <Radio size={26} />
          </button>
        )}
      </div>

      <div className="view-pad">
        {a.topSongs.length > 0 && (
          <section className="shelf">
            <header className="shelf-header">
              <h2>Popular</h2>
            </header>
            <TrackList
              tracks={showAll ? a.topSongs : a.topSongs.slice(0, 5)}
              variant="popular"
              showHeader={false}
              context={{ id, title: a.name }}
            />
            {(a.topSongs.length > 5 || a.topSongsPlaylist) && (
              <button
                className="show-all see-more"
                onClick={() =>
                  a.topSongs.length > 5 && !showAll
                    ? setShowAll(true)
                    : a.topSongsPlaylist && useNav.getState().go({ name: 'collection', id: a.topSongsPlaylist })
                }
              >
                See more
              </button>
            )}
          </section>
        )}
        {a.shelves.map((s, i) => (
          <ShelfView key={`${s.title}-${i}`} shelf={s} />
        ))}
        {a.description && (
          <section className="shelf">
            <header className="shelf-header">
              <h2>About</h2>
            </header>
            <div className="about-card" style={{ backgroundImage: a.thumb ? `linear-gradient(90deg, rgba(0,0,0,.85) 40%, rgba(0,0,0,.2)), url("${hiRes(a.thumb, 1080)}")` : undefined }}>
              {a.subscribers && <div className="about-listeners">{a.subscribers}</div>}
              <p>{a.description}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
