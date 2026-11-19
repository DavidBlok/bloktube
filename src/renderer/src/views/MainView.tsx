import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { savedScroll, saveScroll, useNav } from '../store/nav'
import { useUi } from '../store/ui'
import { PlayCircle } from '../components/common'
import { HomeView } from './HomeView'
import { SearchView } from './SearchView'
import { CollectionView } from './CollectionView'
import { ArtistView } from './ArtistView'
import { BrowseView } from './BrowseView'
import { LyricsView } from './LyricsView'
import { DownloadsView } from './DownloadsView'
import { HistoryView } from './HistoryView'
import { SettingsView } from './SettingsView'
import { UploadsView } from './UploadsView'

export function MainView() {
  const index = useNav((s) => s.index)
  const route = useNav((s) => s.stack[s.index])
  const header = useUi((s) => s.header)
  const setHeader = useUi((s) => s.setHeader)
  const ref = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(0)
  const viewKey = route.name === 'search' ? `${index}:search` : `${index}:${JSON.stringify(route)}`

  useEffect(() => setHeader({}), [viewKey, setHeader])

  useLayoutEffect(() => {
    const top = savedScroll(index)
    if (ref.current) ref.current.scrollTop = top
    setScrolled(top)
  }, [viewKey, index])

  let view
  switch (route.name) {
    case 'home':
      view = <HomeView />
      break
    case 'search':
      view = <SearchView query={route.query} filter={route.filter} />
      break
    case 'collection':
      view = <CollectionView key={route.id} id={route.id} />
      break
    case 'artist':
      view = <ArtistView key={route.id} id={route.id} />
      break
    case 'browse':
      view = <BrowseView key={`${route.id}:${route.params}`} id={route.id} params={route.params} title={route.title} />
      break
    case 'lyrics':
      view = <LyricsView />
      break
    case 'downloads':
      view = <DownloadsView />
      break
    case 'history':
      view = <HistoryView />
      break
    case 'settings':
      view = <SettingsView />
      break
    case 'uploads':
      view = <UploadsView />
      break
  }

  const showSticky = !!header.title && scrolled > 280
  return (
    <main className={`main panel ${route.name === 'lyrics' ? 'lyrics-mode' : ''}`}>
      <div className={`main-sticky ${showSticky ? 'visible' : ''}`} style={{ backgroundColor: header.color }}>
        {header.play && <PlayCircle size={44} playing={header.playing} onClick={header.play} />}
        <span className="main-sticky-title">{header.title}</span>
      </div>
      <div
        ref={ref}
        className="scroller"
        data-scroller
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop
          saveScroll(index, top)
          if ((top > 280) !== (scrolled > 280) || Math.abs(top - scrolled) > 40) setScrolled(top)
        }}
      >
        {view}
      </div>
    </main>
  )
}
