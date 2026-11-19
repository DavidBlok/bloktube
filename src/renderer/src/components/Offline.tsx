import { useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'
import { useOnline } from '../lib/offline'
import { useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { Spinner } from './common'

const goToDownloads = () => useNav.getState().go({ name: 'downloads' })

export function OfflineBanner() {
  const online = useOnline()
  const hasDownloads = usePlayer((s) => s.downloads.tracks.length > 0)
  const onDownloads = useNav((s) => s.stack[s.index].name === 'downloads')
  const startedOffline = useRef(!navigator.onLine)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current || !hasDownloads) return
    handled.current = true
    const nav = useNav.getState()
    if (startedOffline.current && !navigator.onLine && nav.index === 0 && nav.stack[0].name === 'home') nav.replace({ name: 'downloads' })
  }, [hasDownloads])
  if (online) return null
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} />
      <span>You’re offline. Only downloaded music is available.</span>
      {hasDownloads && !onDownloads && (
        <button className="pill white small" onClick={goToDownloads}>
          Go to Downloads
        </button>
      )}
    </div>
  )
}

export function OfflineState({ what = 'this page' }: { what?: string }) {
  const hasDownloads = usePlayer((s) => s.downloads.tracks.length > 0)
  return (
    <div className="empty-state offline-state">
      <WifiOff size={40} />
      <h2>You’re offline</h2>
      <p>Connect to the internet to see {what}.</p>
      {hasDownloads && (
        <button className="pill white" onClick={goToDownloads}>
          Go to Downloads
        </button>
      )}
    </div>
  )
}

export function Pending({ paused, what }: { paused: boolean; what?: string }) {
  return paused ? <OfflineState what={what} /> : <Spinner />
}
