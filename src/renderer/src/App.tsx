import { useEffect } from 'react'
import { blok } from './api'
import { PlayerBar } from './components/PlayerBar'
import { RightPanel } from './components/RightPanel'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { OfflineBanner } from './components/Offline'
import { AuthOverlay, ContextMenu, DialogHost, Toast } from './components/Overlays'
import { MainView } from './views/MainView'
import { useNav } from './store/nav'
import { usePlayer } from './store/player'
import { useUi } from './store/ui'

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUi.getState().dialog) return
      const mod = e.metaKey || e.ctrlKey
      const typing = isTyping(e)
      const nav = useNav.getState()
      if (mod && (e.key === 'k' || e.key === 'l')) {
        e.preventDefault()
        window.dispatchEvent(new Event('blok:focus-search'))
        return
      }
      if (typing) return
      const vol = usePlayer.getState().state?.volume ?? 100
      if (e.key === ' ') {
        e.preventDefault()
        blok.player.toggle()
      } else if (mod && e.key === 'ArrowRight') {
        e.preventDefault()
        blok.player.next()
      } else if (mod && e.key === 'ArrowLeft') {
        e.preventDefault()
        blok.player.previous()
      } else if (mod && e.key === 'ArrowUp') {
        e.preventDefault()
        blok.player.setVolume(Math.min(100, vol + 10))
      } else if (mod && e.key === 'ArrowDown') {
        e.preventDefault()
        blok.player.setVolume(Math.max(0, vol - 10))
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        blok.player.toggleShuffle()
      } else if (mod && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        blok.player.cycleRepeat()
      } else if ((e.altKey && e.key === 'ArrowLeft') || (mod && e.key === '[')) {
        e.preventDefault()
        nav.back()
      } else if ((e.altKey && e.key === 'ArrowRight') || (mod && e.key === ']')) {
        e.preventDefault()
        nav.forward()
      } else if (e.shiftKey && e.key === 'ArrowRight') {
        const s = usePlayer.getState().state
        if (s) blok.player.seek(Math.min(s.duration, s.position + 5))
      } else if (e.shiftKey && e.key === 'ArrowLeft') {
        const s = usePlayer.getState().state
        if (s) blok.player.seek(Math.max(0, s.position - 5))
      }
    }
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) useNav.getState().back()
      if (e.button === 4) useNav.getState().forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [])
}

function useDocumentTitle() {
  const title = usePlayer((s) => s.state?.title)
  const artist = usePlayer((s) => s.state?.artists[0]?.name)
  const playing = usePlayer((s) => s.state?.playing)
  useEffect(() => {
    document.title = playing && title ? `${title}${artist ? ` • ${artist}` : ''}` : 'BlokTube'
  }, [title, artist, playing])
}

export function App() {
  const rightPanel = useUi((s) => s.rightPanel)
  useShortcuts()
  useDocumentTitle()
  return (
    <div className={`app platform-${blok.platform}`}>
      <TopBar />
      <div className={`body ${rightPanel !== 'none' ? 'with-right' : ''}`}>
        <Sidebar />
        <MainView />
        <RightPanel />
      </div>
      <PlayerBar />
      <ContextMenu />
      <DialogHost />
      <Toast />
      <AuthOverlay />
      <OfflineBanner />
    </div>
  )
}
