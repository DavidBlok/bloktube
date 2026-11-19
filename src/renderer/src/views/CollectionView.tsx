import { useEffect, useMemo, type MouseEvent } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, CirclePlus, CircleCheck, Ellipsis, Globe, Heart, Link, Lock, Pencil, Radio, Shuffle, Trash2 } from 'lucide-react'
import type { PlaylistPrivacy } from '@shared/types'
import { blok, errorMessage } from '../api'
import { ShelfView } from '../components/Cards'
import { Artwork, ArtistLinks, ErrorState, PlayCircle, Spinner, useArtColor } from '../components/common'
import { DownloadButton } from '../components/Download'
import { Pending } from '../components/Offline'
import { TrackList } from '../components/TrackList'
import { cardUrl, copy } from '../lib/actions'
import { titleSize } from '../lib/format'
import { confirmDeletePlaylist, openEditPlaylist, setPlaylistPrivacy, useSaveCollection } from '../lib/mutations'
import { localCollection, useOnline } from '../lib/offline'
import { queries, queryClient } from '../lib/query'
import { useSentinel } from '../lib/useSentinel'
import { usePlayer } from '../store/player'
import { toast, useUi } from '../store/ui'

const PRIVACY: { value: PlaylistPrivacy; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'UNLISTED', label: 'Unlisted' },
  { value: 'PRIVATE', label: 'Private' }
]

export function CollectionView({ id }: { id: string }) {
  const q = useInfiniteQuery(queries.collection(id))
  const online = useOnline()
  const downloads = usePlayer((s) => s.downloads)
  const local = useMemo(
    () => (online || q.data ? undefined : localCollection(id, downloads, queryClient.getQueryData(queries.library().queryKey))),
    [online, q.data, id, downloads]
  )
  const page = q.data ?? local
  const save = useSaveCollection(id)
  const isLiked = id === 'VLLM'
  const color = useArtColor(isLiked ? undefined : page?.thumb, isLiked ? '#4b3b8f' : '#4a4a4a')
  const play = usePlayer((s) => s.play)
  const isContext = usePlayer((s) => s.context?.id === id)
  const playing = usePlayer((s) => !!s.state?.playing)
  const setHeader = useUi((s) => s.setHeader)
  const openMenu = useUi((s) => s.openMenu)

  const title = isLiked ? 'Liked Songs' : (page?.title ?? '')
  const editable = !isLiked && !!page?.editable
  const ctx = page ? { id, title, playlistId: page.playlistId, editable } : null

  const onPlay = () => {
    if (!page) return
    if (isContext) blok.player.toggle()
    else play(page.play ?? (page.playlistId ? { playlistId: page.playlistId } : undefined), { id, title })
  }

  useEffect(() => {
    if (page) setHeader({ title, color, play: onPlay, playing: isContext && playing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, color, isContext, playing, title])

  const loadMore = async () => {
    const r = await q.fetchNextPage()
    if (r.isError) toast(errorMessage(r.error))
  }
  const sentinel = useSentinel(loadMore, q.hasNextPage && !q.isFetching && !q.isFetchNextPageError)

  if (!page && q.isPending) return <Pending paused={q.fetchStatus === 'paused'} what="this playlist" />
  if (q.isError && !page) {
    return (
      <ErrorState
        message={errorMessage(q.error)}
        action={
          id.startsWith('VL') && (
            <button className="pill white" onClick={() => play({ playlistId: id.slice(2) }, { id, title: 'Mix' })}>
              Play instead
            </button>
          )
        }
      />
    )
  }
  if (!page) return null

  const toggleSave = () => {
    if (page.playlistId) save.mutate({ playlistId: page.playlistId, save: !page.saved })
  }

  const editDetails = () => openEditPlaylist({ id, title, description: page.description ?? '', thumb: page.thumb })

  const moreMenu = (e: MouseEvent) =>
    openMenu(e.clientX, e.clientY, [
      ...(editable
        ? [
            { label: 'Edit details', icon: <Pencil size={16} />, onClick: editDetails },
            {
              label: 'Privacy',
              icon: page.privacy === 'PRIVATE' ? <Lock size={16} /> : <Globe size={16} />,
              submenu: PRIVACY.map((p) => ({
                label: p.label,
                icon: page.privacy === p.value ? <Check size={16} /> : <span className="cm-blank" />,
                onClick: () => page.privacy !== p.value && setPlaylistPrivacy({ id, title }, p.value)
              }))
            },
            { label: 'Delete', icon: <Trash2 size={16} />, onClick: () => confirmDeletePlaylist({ id, title }) },
            { label: '', divider: true }
          ]
        : []),
      ...(page.radio ? [{ label: 'Go to radio', icon: <Radio size={16} />, onClick: () => play(page.radio, { id: `radio:${id}`, title: `${title} Radio` }) }] : []),
      { label: 'Copy link', icon: <Link size={16} />, onClick: () => copy(cardUrl({ kind: page.kind, id, title, subtitle: '' })) }
    ])

  const meta = [page.year, ...page.meta].filter(Boolean)
  return (
    <div className="view collection">
      <div className="hero" style={{ background: `linear-gradient(180deg, ${color} 0%, ${color}99 100%)` }}>
        {isLiked ? (
          <div className="hero-art liked-art">
            <Heart size={80} fill="currentColor" />
          </div>
        ) : (
          <Artwork src={page.thumb} className="hero-art" />
        )}
        <div className="hero-info">
          <div className="hero-type">{page.typeLabel}</div>
          <h1
            className={`hero-title t-${titleSize(title)} ${editable ? 'editable' : ''}`}
            onClick={editable ? editDetails : undefined}
            title={editable ? 'Edit details' : undefined}
          >
            {title}
          </h1>
          {page.description && !isLiked && <p className="hero-desc">{page.description}</p>}
          <div className="hero-meta">
            {editable && page.privacy && (
              <span className="privacy-tag" title="Change in ⋯ → Privacy">
                {page.privacy === 'PRIVATE' ? <Lock size={12} /> : <Globe size={12} />}
                {PRIVACY.find((p) => p.value === page.privacy)?.label}
              </span>
            )}
            {page.ownerThumb && <Artwork src={page.ownerThumb} size={24} round />}
            {page.artists.length > 0 && !isLiked && <ArtistLinks artists={page.artists} className="strong" />}
            {meta.map((m, i) => (
              <span key={i} className="dot-sep">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="action-bar" style={{ background: `linear-gradient(180deg, ${color}66 0%, transparent 240px)` }}>
        <PlayCircle size={56} playing={isContext && playing} onClick={onPlay} />
        {page.shuffle && (
          <button className="icon-btn big" onClick={() => play(page.shuffle, { id, title })} title="Shuffle play">
            <Shuffle size={28} />
          </button>
        )}
        {!isLiked && !editable && page.saved !== undefined && (
          <button className={`icon-btn big ${page.saved ? 'active' : ''}`} onClick={toggleSave} disabled={save.isPending} title={page.saved ? 'Remove from Your Library' : 'Save to Your Library'}>
            {page.saved ? <CircleCheck size={30} /> : <CirclePlus size={30} />}
          </button>
        )}
        {page.playlistId && page.kind !== 'podcast' && page.tracks.length > 0 && <DownloadButton playlistId={page.playlistId} title={title} />}
        <button className="icon-btn big" onClick={moreMenu} title="More options">
          <Ellipsis size={28} />
        </button>
      </div>

      <div className="view-pad">
        {page.tracks.length ? (
          <TrackList tracks={page.tracks} variant={page.kind === 'album' ? 'album' : page.kind === 'podcast' ? 'episodes' : 'playlist'} context={ctx} partial={!!q.hasNextPage} />
        ) : (
          <div className="empty-state">
            {editable ? (
              <>
                <h2>Let’s find something for your playlist</h2>
                <p>Right-click any song and choose Add to playlist.</p>
              </>
            ) : (
              <p>This {page.kind} is empty.</p>
            )}
          </div>
        )}
        <div ref={sentinel} />
        {q.isFetchingNextPage && <Spinner />}
        {page.related.map((s, i) => (
          <ShelfView key={`${s.title}-${i}`} shelf={s} />
        ))}
      </div>
    </div>
  )
}
