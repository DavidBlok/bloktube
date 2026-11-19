import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, Heart, LibraryBig, LogIn, Plus, RotateCw, Search, Volume2, X } from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { blok, errorMessage } from '../api'
import { cardMenu } from '../lib/actions'
import { playlistIdOfCard, usePlaylistDownload } from '../lib/downloads'
import { downloadedLibrary, useOnline } from '../lib/offline'
import { addToPlaylist, createPlaylist, rateTrack } from '../lib/mutations'
import { getTrackDrag } from '../lib/drag'
import { queries } from '../lib/query'
import { openCard, useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'
import { Artwork } from './common'
import { DownloadGlyph } from './Download'

type Filter = 'all' | 'playlist' | 'album' | 'podcast' | 'artist' | 'downloaded'

const label: Record<string, string> = { playlist: 'Playlist', mix: 'Playlist', album: 'Album', artist: 'Artist', podcast: 'Podcast' }

const CHIP_LABEL = { playlist: 'Playlists', album: 'Albums', podcast: 'Podcasts', artist: 'Artists' }

export function Sidebar() {
  const auth = usePlayer((s) => s.auth)
  const signedIn = auth.status === 'signed-in'
  const lib = useQuery({ ...queries.library(), enabled: signedIn })
  const online = useOnline()
  const loading = lib.isFetching
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const downloads = usePlayer((s) => s.downloads)
  const hasDownloads = downloads.tracks.length > 0 || downloads.playlists.length > 0
  const downloadedIds = useMemo(() => new Set(downloads.playlists.map((p) => p.playlistId)), [downloads.playlists])

  useEffect(() => {
    if (lib.error) toast(errorMessage(lib.error))
  }, [lib.error])

  const hasPodcasts = !!lib.data?.some((i) => i.kind === 'podcast')

  useEffect(() => {
    if ((filter === 'downloaded' && !hasDownloads) || (filter === 'podcast' && !hasPodcasts)) setFilter('all')
  }, [filter, hasDownloads, hasPodcasts])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = lib.data ?? (online ? [] : downloadedLibrary(downloads))
    const extra = filter === 'downloaded' ? downloadedLibrary(downloads).filter((d) => !base.some((i) => playlistIdOfCard(i) === playlistIdOfCard(d))) : []
    return [...base, ...extra].filter((it) => {
      if (filter === 'downloaded') {
        if (it.kind === 'artist' || !downloadedIds.has(playlistIdOfCard(it))) return false
      } else if (filter !== 'all' && it.kind !== filter && !(filter === 'playlist' && it.kind === 'mix')) return false
      return !q || it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q)
    })
  }, [lib.data, filter, query, downloadedIds, online, downloads])

  const showLiked = !query && (filter === 'all' || filter === 'playlist' || (filter === 'downloaded' && downloadedIds.has('LM')))
  const showDownloads = !query && downloads.tracks.length > 0 && (filter === 'all' || filter === 'downloaded')

  return (
    <aside className="sidebar panel">
      <header className="sb-header">
        <div className="sb-title">
          <LibraryBig size={22} />
          <span>Your Library</span>
        </div>
        {signedIn && (
          <div className="sb-actions">
            <button className={`icon-btn ${loading ? 'spin' : ''}`} onClick={() => lib.refetch()} title="Refresh library">
              <RotateCw size={16} />
            </button>
            <button className="icon-btn sb-create" onClick={() => createPlaylist()} title="Create playlist" disabled={!online}>
              <Plus size={18} />
            </button>
          </div>
        )}
      </header>

      {signedIn && (
        <>
          <div className="chips">
            {(['playlist', 'album', ...(hasPodcasts ? (['podcast'] as const) : []), 'artist'] as const).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(filter === f ? 'all' : f)}>
                {CHIP_LABEL[f]}
              </button>
            ))}
            {hasDownloads && (
              <button className={`chip ${filter === 'downloaded' ? 'active' : ''}`} onClick={() => setFilter(filter === 'downloaded' ? 'all' : 'downloaded')}>
                Downloaded
              </button>
            )}
          </div>
          <div className="sb-search">
            {searching ? (
              <div className="sb-search-box">
                <Search size={14} />
                <input autoFocus value={query} placeholder="Search in Your Library" onChange={(e) => setQuery(e.target.value)} />
                <button
                  className="icon-btn"
                  onClick={() => {
                    setQuery('')
                    setSearching(false)
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button className="icon-btn" onClick={() => setSearching(true)} title="Search in Your Library">
                <Search size={16} />
              </button>
            )}
          </div>
        </>
      )}

      <div className="sb-list">
        {!signedIn ? (
          <div className="sb-prompt">
            <h3>Create your library</h3>
            <p>Sign in with your Google account to see your playlists, albums, artists and liked songs.</p>
            <button className="pill white" onClick={() => blok.auth.signIn()} disabled={auth.status === 'starting'}>
              <LogIn size={16} /> Sign in
            </button>
          </div>
        ) : (
          <>
            {showLiked && (
              <LibraryRow
                item={{ kind: 'playlist', id: 'VLLM', title: 'Liked Songs', subtitle: 'Auto playlist' }}
                icon={
                  <div className="liked-tile">
                    <Heart size={20} fill="currentColor" />
                  </div>
                }
              />
            )}
            {showDownloads && <DownloadsRow count={downloads.tracks.length} />}
            {items.map((it) => (
              <LibraryRow key={it.id} item={it} />
            ))}
            {!items.length && !loading && query && <div className="sb-empty">No results for “{query}”</div>}
          </>
        )}
      </div>
    </aside>
  )
}

function LibraryRow({ item, icon }: { item: LibraryItem; icon?: ReactNode }) {
  const active = useNav((s) => {
    const r = s.stack[s.index]
    return (r.name === 'collection' || r.name === 'artist') && r.id === item.id
  })
  const isContext = usePlayer((s) => s.context?.id === item.id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const openMenu = useUi((s) => s.openMenu)
  const download = usePlaylistDownload(item.kind === 'artist' ? undefined : playlistIdOfCard(item))
  const [over, setOver] = useState(false)
  const droppable = item.id === 'VLLM' || !!item.editable
  const sub = item.kind === 'artist' ? 'Artist' : [label[item.kind] ?? '', item.subtitle.replace(/^(Playlist|Album|Single|EP)\s•\s/i, '')].filter(Boolean).join(' • ')
  return (
    <div
      className={`lib-row ${active ? 'active' : ''} ${over ? 'drop-target' : ''}`}
      onClick={() => openCard(item)}
      onDragOver={(e) => {
        if (!droppable || !getTrackDrag()) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const drag = getTrackDrag()
        if (!droppable || !drag) return
        e.preventDefault()
        if (item.id === 'VLLM') {
          for (const t of drag.tracks) if (t.likeStatus !== 'LIKE') rateTrack(t, 'LIKE')
        } else addToPlaylist(item, [...new Set(drag.tracks.map((t) => t.videoId))])
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, cardMenu(item))
      }}
    >
      {icon ?? <Artwork src={item.thumb} size={48} round={item.kind === 'artist'} />}
      <div className="lib-text">
        <div className={`lib-title ${isContext ? 'current' : ''}`}>{item.title}</div>
        <div className="lib-sub">
          {download && <DownloadGlyph status={download.status} progress={download.progress} size={12} />}
          <span>{sub}</span>
        </div>
      </div>
      {isContext && playing && <Volume2 size={14} className="lib-playing" />}
    </div>
  )
}

function DownloadsRow({ count }: { count: number }) {
  const active = useNav((s) => s.stack[s.index].name === 'downloads')
  const isContext = usePlayer((s) => s.context?.id === 'downloads')
  return (
    <div className={`lib-row ${active ? 'active' : ''}`} onClick={() => useNav.getState().go({ name: 'downloads' })}>
      <div className="downloads-tile">
        <ArrowDown size={22} strokeWidth={2.5} />
      </div>
      <div className="lib-text">
        <div className={`lib-title ${isContext ? 'current' : ''}`}>Downloads</div>
        <div className="lib-sub">
          <span>
            Playlist • {count} {count === 1 ? 'song' : 'songs'}
          </span>
        </div>
      </div>
    </div>
  )
}
