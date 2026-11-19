import { create } from 'zustand'
import type { Card, SearchFilter, Shelf } from '@shared/types'

export type Route =
  | { name: 'home' }
  | { name: 'search'; query: string; filter?: SearchFilter }
  | { name: 'collection'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'browse'; id: string; params?: string; title?: string }
  | { name: 'lyrics' }
  | { name: 'downloads' }
  | { name: 'history' }
  | { name: 'uploads' }
  | { name: 'settings' }

interface NavStore {
  stack: Route[]
  index: number
  go: (r: Route) => void
  replace: (r: Route) => void
  back: () => void
  forward: () => void
}

const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b)

export const useNav = create<NavStore>((set, get) => ({
  stack: [{ name: 'home' }],
  index: 0,
  go(r) {
    const { stack, index } = get()
    if (same(stack[index], r)) return
    const next = [...stack.slice(0, index + 1), r].slice(-60)
    for (const k of [...scrollPositions.keys()]) if (k >= next.length - 1) scrollPositions.delete(k)
    set({ stack: next, index: next.length - 1 })
  },
  replace(r) {
    const { stack, index } = get()
    const next = [...stack]
    next[index] = r
    set({ stack: next })
  },
  back() {
    const { index } = get()
    if (index > 0) set({ index: index - 1 })
  },
  forward() {
    const { index, stack } = get()
    if (index < stack.length - 1) set({ index: index + 1 })
  }
}))

const scrollPositions = new Map<number, number>()
export const saveScroll = (index: number, top: number) => scrollPositions.set(index, top)
export const savedScroll = (index: number) => scrollPositions.get(index) ?? 0

export const currentRoute = () => {
  const { stack, index } = useNav.getState()
  return stack[index]
}

export function routeForBrowseId(browseId: string, params?: string, title?: string): Route {
  if (browseId.startsWith('VL') || browseId.startsWith('MPRE') || browseId.startsWith('MPSP')) return { name: 'collection', id: browseId }
  if ((browseId.startsWith('UC') || browseId.startsWith('MPLAUC')) && !params) return { name: 'artist', id: browseId }
  return { name: 'browse', id: browseId, params, title }
}

export function openCard(card: Card) {
  const { go } = useNav.getState()
  switch (card.kind) {
    case 'album':
    case 'playlist':
    case 'mix':
      go({ name: 'collection', id: card.id })
      return true
    case 'artist':
      go({ name: 'artist', id: card.id })
      return true
    case 'category':
      go({ name: 'browse', id: card.id, params: card.params, title: card.title })
      return true
    case 'podcast':
      go({ name: 'collection', id: card.id })
      return true
    default:
      return false
  }
}

export function openMore(shelf: Shelf) {
  if (!shelf.more) return
  useNav.getState().go(routeForBrowseId(shelf.more.browseId, shelf.more.params, shelf.title))
}

export function openArtist(id: string | null | undefined) {
  if (id) useNav.getState().go(id.startsWith('MPSP') ? { name: 'collection', id } : { name: 'artist', id })
}

export function openAlbum(id: string | null | undefined) {
  if (id) useNav.getState().go({ name: 'collection', id })
}
