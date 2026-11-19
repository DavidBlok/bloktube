import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { blok } from '../api'
import { Spinner, useArtColor } from '../components/common'
import { useLivePosition } from '../components/PlayerBar'
import { queries } from '../lib/query'
import { usePlayer } from '../store/player'

export function LyricsView() {
  const s = usePlayer((x) => x.state)
  const videoId = s?.videoId ?? null
  const ready = !!videoId && (s?.duration ?? 0) > 0
  const lyrics = useQuery({ ...queries.lyrics(s), enabled: ready })
  const color = useArtColor(s?.thumb, '#4d4d4d')
  const position = useLivePosition(100)
  const listRef = useRef<HTMLDivElement>(null)
  const userScrolled = useRef(0)

  const synced = lyrics.data?.synced
  const active = useMemo(() => {
    if (!synced?.length) return -1
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= position + 0.25) idx = i
      else break
    }
    return idx
  }, [synced, position])

  useEffect(() => {
    if (active < 0 || Date.now() - userScrolled.current < 3500) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  useEffect(() => {
    const scroller = listRef.current?.closest('[data-scroller]')
    const mark = () => (userScrolled.current = Date.now())
    scroller?.addEventListener('wheel', mark, { passive: true })
    return () => scroller?.removeEventListener('wheel', mark)
  }, [])

  let body
  if (!videoId) body = <p className="lyrics-empty">Play a song to see its lyrics.</p>
  else if (lyrics.isPending && lyrics.fetchStatus === 'paused') body = <p className="lyrics-empty">Lyrics aren’t available offline.</p>
  else if (!ready || lyrics.isPending) body = <Spinner />
  else if (synced?.length) {
    body = synced.map((l, i) => (
      <p
        key={i}
        data-line={i}
        className={`lyric-line ${i === active ? 'active' : i < active ? 'past' : ''}`}
        onClick={() => blok.player.seek(l.time)}
      >
        {l.text || '♪'}
      </p>
    ))
  } else if (lyrics.data?.plain) {
    body = lyrics.data.plain.split('\n').map((l, i) => (
      <p key={i} className="lyric-line plain">
        {l || ' '}
      </p>
    ))
  } else body = <p className="lyrics-empty">Looks like we don’t have the lyrics for this song.</p>

  return (
    <div className="view lyrics" style={{ backgroundColor: color }}>
      <div className="lyrics-inner" ref={listRef}>
        {body}
        {lyrics.data?.source && <div className="lyrics-source">Lyrics provided by {lyrics.data.source.replace(/^Source:\s*/i, '')}</div>}
      </div>
    </div>
  )
}
