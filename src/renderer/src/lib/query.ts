import { QueryClient, infiniteQueryOptions, queryOptions, type InfiniteData, type QueryKey } from '@tanstack/react-query'
import type { CollectionPage, LikeStatus, PlayerState, SearchFilter, SearchResults, ShelfPage, Track } from '@shared/types'
import { blok } from '../api'
import { artistNames } from './format'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { networkMode: 'always' }
  }
})

export interface CollectionChunk {
  page?: CollectionPage
  tracks: Track[]
  continuation?: string
}

type Cont = string | undefined

const mergeHome = (d: InfiniteData<ShelfPage, Cont>): ShelfPage => ({
  ...d.pages[0],
  shelves: d.pages.flatMap((p) => p.shelves),
  continuation: d.pages.at(-1)?.continuation
})

const mergeCollection = (d: InfiniteData<CollectionChunk, Cont>): CollectionPage => ({
  ...d.pages[0].page!,
  tracks: d.pages.flatMap((p) => p.tracks),
  continuation: d.pages.at(-1)?.continuation
})

const mergeSearch = (d: InfiniteData<SearchResults, Cont>): SearchResults => ({
  ...d.pages[0],
  tracks: d.pages.flatMap((p) => p.tracks),
  cards: d.pages.flatMap((p) => p.cards),
  continuation: d.pages.at(-1)?.continuation
})

export const queries = {
  home: () =>
    infiniteQueryOptions({
      queryKey: ['home'],
      queryFn: ({ pageParam }) => blok.ytm.home(pageParam),
      initialPageParam: undefined as Cont,
      getNextPageParam: (p) => p.continuation,
      select: mergeHome,
      staleTime: 10 * 60_000
    }),
  browse: (id: string, params?: string) =>
    queryOptions({ queryKey: ['browse', id, params ?? ''], queryFn: () => blok.ytm.browse(id, params) }),
  moods: () => queryOptions({ queryKey: ['moods'], queryFn: () => blok.ytm.moods(), staleTime: 60 * 60_000 }),
  searchAll: (query: string) => queryOptions({ queryKey: ['search', 'all', query], queryFn: () => blok.ytm.search(query) }),
  search: (query: string, filter: SearchFilter) =>
    infiniteQueryOptions({
      queryKey: ['search', filter, query],
      queryFn: ({ pageParam }) => (pageParam ? blok.ytm.searchMore(pageParam, filter) : blok.ytm.search(query, filter)),
      initialPageParam: undefined as Cont,
      getNextPageParam: (p) => p.continuation,
      select: mergeSearch
    }),
  collection: (id: string) =>
    infiniteQueryOptions({
      queryKey: ['collection', id],
      queryFn: async ({ pageParam }): Promise<CollectionChunk> => {
        if (pageParam) return blok.ytm.collectionMore(pageParam)
        const page = await blok.ytm.collection(id)
        return { page: { ...page, tracks: [] }, tracks: page.tracks, continuation: page.continuation }
      },
      initialPageParam: undefined as Cont,
      getNextPageParam: (c) => c.continuation,
      select: mergeCollection
    }),
  artist: (id: string) => queryOptions({ queryKey: ['artist', id], queryFn: () => blok.ytm.artist(id) }),
  library: () => queryOptions({ queryKey: ['library'], queryFn: () => blok.ytm.library(), staleTime: 5 * 60_000 }),
  history: () => queryOptions({ queryKey: ['history'], queryFn: () => blok.ytm.history(), staleTime: 30_000 }),
  uploads: () => queryOptions({ queryKey: ['uploads'], queryFn: () => blok.ytm.uploads() }),
  ytmSettings: () => queryOptions({ queryKey: ['ytmSettings'], queryFn: () => blok.ytm.settings(), staleTime: 5 * 60_000 }),
  lyrics: (s: PlayerState | null) =>
    queryOptions({
      queryKey: ['lyrics', s?.videoId ?? null],
      queryFn: () =>
        blok.ytm.lyrics(s!.videoId!, s!.title, s!.artists[0]?.name ?? artistNames(s!.artists), s!.album?.name ?? '', s!.duration),
      staleTime: Infinity
    }),
  color: (url: string | undefined) =>
    queryOptions({ queryKey: ['color', url ?? null], queryFn: () => blok.ytm.color(url!), staleTime: Infinity, gcTime: 30 * 60_000 })
}

const TRACK_QUERIES = ['collection', 'artist', 'search', 'history', 'uploads']
const TRACK_LISTS = ['tracks', 'topTracks', 'topSongs']

function withLike(data: unknown, videoId: string, status: LikeStatus): unknown {
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map((x) => withLike(x, videoId, status))
  const d = data as Record<string, unknown>
  if (Array.isArray(d.pages)) return { ...d, pages: d.pages.map((p) => withLike(p, videoId, status)) }
  let out = d
  for (const key of TRACK_LISTS) {
    const list = d[key] as Track[] | undefined
    if (!Array.isArray(list) || !list.some((t) => t.videoId === videoId && t.likeStatus !== status)) continue
    out = { ...out, [key]: list.map((t) => (t.videoId === videoId ? { ...t, likeStatus: status } : t)) }
  }
  return out
}

export function snapshotTrackQueries(): [QueryKey, unknown][] {
  return TRACK_QUERIES.flatMap((k) => queryClient.getQueriesData({ queryKey: [k] }))
}

export function setTrackLike(videoId: string, status: LikeStatus) {
  for (const k of TRACK_QUERIES) queryClient.setQueriesData({ queryKey: [k] }, (d: unknown) => withLike(d, videoId, status))
}

export const refreshLikedSongs = () => queryClient.invalidateQueries({ queryKey: queries.collection('VLLM').queryKey })
