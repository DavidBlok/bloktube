import { Fragment, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, LoaderCircle, Music, Pause, Play } from 'lucide-react'
import type { Ref } from '@shared/types'
import { queries } from '../lib/query'
import { openArtist } from '../store/nav'

export function Artwork({
  src,
  alt = '',
  round,
  size,
  className = ''
}: {
  src?: string
  alt?: string
  round?: boolean
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const style = size ? { width: size, height: size } : undefined
  return (
    <div className={`artwork ${round ? 'round' : ''} ${className}`} style={style}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <div className="artwork-fallback">
          <Music size={size ? Math.max(16, size / 3) : 32} />
        </div>
      )}
    </div>
  )
}

export function ArtistLinks({ artists, className = '' }: { artists: Ref[] | undefined; className?: string }) {
  if (!artists?.length) return null
  return (
    <span className={`artist-links ${className}`}>
      {artists.map((a, i) => (
        <Fragment key={`${a.id ?? a.name}-${i}`}>
          {i > 0 && ', '}
          {a.id ? (
            <a
              className="link"
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                openArtist(a.id)
              }}
            >
              {a.name}
            </a>
          ) : (
            <span>{a.name}</span>
          )}
        </Fragment>
      ))}
    </span>
  )
}

export function PlayCircle({
  playing,
  onClick,
  size = 56,
  className = ''
}: {
  playing?: boolean
  onClick: (e: MouseEvent) => void
  size?: number
  className?: string
}) {
  const icon = Math.round(size * 0.42)
  return (
    <button
      className={`play-circle ${className}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      aria-label={playing ? 'Pause' : 'Play'}
    >
      {playing ? <Pause size={icon} fill="currentColor" strokeWidth={0} /> : <Play size={icon} fill="currentColor" strokeWidth={0} style={{ marginLeft: icon * 0.08 }} />}
    </button>
  )
}

export function Equalizer() {
  return (
    <span className="equalizer" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <div className="spinner">
      <LoaderCircle size={size} className="spin" />
    </div>
  )
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="error-state">
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {action}
    </div>
  )
}

export function HeartButton({
  liked,
  onToggle,
  size = 16,
  className = ''
}: {
  liked: boolean
  onToggle: () => void
  size?: number
  className?: string
}) {
  return (
    <button
      className={`icon-btn heart ${liked ? 'active' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}

export function useArtColor(url: string | undefined, fallback = '#3a3a3a'): string {
  const q = useQuery({ ...queries.color(url), enabled: !!url, placeholderData: (prev) => prev })
  return (url && q.data) || fallback
}
