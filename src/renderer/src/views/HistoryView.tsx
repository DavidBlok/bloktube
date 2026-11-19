import { useQuery } from '@tanstack/react-query'
import { Clock3, Trash2 } from 'lucide-react'
import { errorMessage } from '../api'
import { ErrorState } from '../components/common'
import { Pending } from '../components/Offline'
import { TrackList } from '../components/TrackList'
import { removeFromHistory } from '../lib/mutations'
import { queries } from '../lib/query'

const COLOR = '#2d4a6b'

export function HistoryView() {
  const q = useQuery(queries.history())
  const sections = q.data ?? []
  const total = sections.reduce((a, s) => a + s.tracks.length, 0)

  return (
    <div className="view collection">
      <div className="hero" style={{ background: `linear-gradient(180deg, ${COLOR} 0%, ${COLOR}99 100%)` }}>
        <div className="hero-art history-art">
          <Clock3 size={80} strokeWidth={2} />
        </div>
        <div className="hero-info">
          <div className="hero-type">Listening history</div>
          <h1 className="hero-title t-lg">Recently played</h1>
          {total > 0 && (
            <div className="hero-meta">
              <span className="dot-sep">
                {total} {total === 1 ? 'song' : 'songs'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="view-pad history">
        {q.isPending ? (
          <Pending paused={q.fetchStatus === 'paused'} what="your listening history" />
        ) : q.isError && !q.data ? (
          <ErrorState message={errorMessage(q.error)} />
        ) : !sections.length ? (
          <div className="empty-state">
            <h2>Nothing here yet</h2>
            <p>Songs you play show up here.</p>
          </div>
        ) : (
          sections.map((s) => (
            <section key={s.title} className="history-section">
              <h2 className="section-title">{s.title}</h2>
              <TrackList
                tracks={s.tracks}
                variant="playlist"
                showHeader={false}
                menuExtras={(t) =>
                  t.historyToken ? [{ label: 'Remove from history', icon: <Trash2 size={16} />, onClick: () => removeFromHistory(t) }] : []
                }
              />
            </section>
          ))
        )}
      </div>
    </div>
  )
}
